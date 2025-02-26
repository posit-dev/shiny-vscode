import * as path from "path";
import * as vscode from "vscode";
import {
  checkPythonEnvironment,
  guessWorkspaceLanguage,
  inferFileType,
  type LangName,
} from "./language";
import { projectLanguage } from "./project-language";
import { ProposedFilePreviewProvider } from "./proposed-file-preview-provider";
import { StreamingTagProcessor } from "./streaming-tag-processor";
import { loadSystemPrompt } from "./system-prompt";
import { tools, wrapToolInvocationResult } from "./tools";
import type { FileContentJson } from "./types";
import { createPromiseWithStatus } from "./utils";

const proposedFilePreviewProvider = new ProposedFilePreviewProvider();

// Each set of proposed files gets a unique counter value.
let proposedFilePreviewCounter = 0;

// The label for the editor tab that shows proposed changes.
const PROPOSED_CHANGES_TAB_LABEL = "Proposed changes";

// Track assistant-specific disposables
let assistantDisposables: vscode.Disposable[] = [];

const hasConfirmedClaude = createPromiseWithStatus<boolean>();
const hasContinuedAfterWorkspaceFolderSuggestion =
  createPromiseWithStatus<void>();

const dummyCancellationToken: vscode.CancellationToken =
  new vscode.CancellationTokenSource().token;

interface ShinyAssistantChatResult extends vscode.ChatResult {
  metadata: {
    command: string | undefined;
    followups: Array<string | vscode.ChatFollowup>;
    // This is the raw response text from the LLM, before we do some
    // transformations and send it to the UI.
    rawResponseText: string;
  };
}

export function activateAssistant(extensionContext: vscode.ExtensionContext) {
  // Clean up any existing disposables
  deactivateAssistant();

  // Create new disposables
  assistantDisposables = [
    vscode.commands.registerCommand(
      "shiny.assistant.saveFilesToWorkspace",
      saveFilesToWorkspace
    ),
    vscode.commands.registerCommand(
      "shiny.assistant.applyChangesToWorkspaceFromDiffView",
      applyChangesToWorkspaceFromDiffView
    ),
    vscode.commands.registerCommand("shiny.assistant.showDiff", showDiff),
    vscode.commands.registerCommand(
      "shiny.assistant.setProjectLanguage",
      (language: LangName) => projectLanguage.set(language)
    ),
    vscode.commands.registerCommand(
      "shiny.assistant.continueAfterClaudeSuggestion",
      (switchedToClaude: boolean) =>
        hasConfirmedClaude.resolve(switchedToClaude)
    ),
    vscode.commands.registerCommand(
      "shiny.assistant.continueAfterWorkspaceFolderSuggestion",
      () => hasContinuedAfterWorkspaceFolderSuggestion.resolve()
    ),
    vscode.workspace.registerTextDocumentContentProvider(
      "proposed-files",
      proposedFilePreviewProvider
    ),
    registerShinyChatParticipant(extensionContext),
  ];

  // Add the assistant disposables to the extension's subscriptions
  assistantDisposables.forEach((d) => extensionContext.subscriptions.push(d));

  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  checkPythonEnvironment();
}

export function deactivateAssistant() {
  if (assistantDisposables.length === 0) {
    return;
  }

  // Dispose of all assistant-specific disposables
  assistantDisposables.forEach((d) => d.dispose());
  assistantDisposables = [];
}

export function registerShinyChatParticipant(
  extensionContext: vscode.ExtensionContext
): vscode.Disposable {
  const handler: vscode.ChatRequestHandler = async (
    request: vscode.ChatRequest,
    chatContext: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<ShinyAssistantChatResult> => {
    const chatResult: ShinyAssistantChatResult = {
      metadata: {
        command: undefined,
        followups: [],
        rawResponseText: "",
      },
    };

    if (request.command === "start") {
      stream.markdown(`Shiny Assistant can help you with building and deploying Shiny applications. You can ask me to:

  - Create a Shiny app
  - Modify an existing Shiny app
  - Install packages needed for your app
  - Troubleshoot a Shiny app

You can also ask me to explain the code in your Shiny app, or to help you with any other questions you have about Shiny.
        `);
      chatResult.metadata.followups.push("Create a simple Shiny app.");
      // chatResult.metadata.followups.push(
      //   "Help me set up a development environment for Shiny apps."
      // );
      chatResult.metadata.followups.push(
        "Install the packages needed for my app."
      );
      // chatResult.metadata.followups.push("Help me deploy my app.");
      return chatResult;
    }

    // If the user isn't using Claude 3.5 Sonnet, prompt them to switch.
    if (
      request.model.id !== "claude-3.5-sonnet" &&
      !hasConfirmedClaude.resolved()
    ) {
      // The text displays much more quickly if we call markdown() twice instead
      // of just once.
      stream.markdown(
        `It looks like you are using **${request.model.name}** for Copilot. `
      );
      stream.markdown(
        "For best results with `@shiny`, please switch to **Claude 3.5 Sonnet**.\n\n"
      );
      stream.button({
        title: "I'll switch to Claude 3.5 Sonnet",
        command: "shiny.assistant.continueAfterClaudeSuggestion",
        arguments: [true],
      });
      stream.button({
        title: `No thanks, I'll continue with ${request.model.name}`,
        command: "shiny.assistant.continueAfterClaudeSuggestion",
        arguments: [false],
      });

      if (await hasConfirmedClaude) {
        stream.markdown(
          new vscode.MarkdownString(
            "Great! In the text input box, switch to Claude 3.5 Sonnet and then click on the $(refresh) button.\n\n",
            true
          )
        );
        return chatResult;
      }
    }

    let showedLanguageButtons = false;

    // Tell the user this works best if they have a workspace folder
    if (!vscode.workspace.workspaceFolders?.[0]) {
      stream.markdown(
        "You currently do not have an active workspace folder.\n\n"
      );
      stream.markdown(
        "Please open a folder by clicking on the **Open Folder** button in the sidebar, or by clicking on the **File** menu and then **Open Folder...** (You can continue without an open folder, but I won't be able to save files to disk and you won't be able to run apps.)\n\n"
      );
      stream.button({
        title: `Got it, continue`,
        command: "shiny.assistant.continueAfterWorkspaceFolderSuggestion",
      });

      await hasContinuedAfterWorkspaceFolderSuggestion;
      if (!vscode.workspace.workspaceFolders?.[0]) {
        stream.markdown(
          "Continuing without an active workspace folder. Not all features will work.\n\n"
        );
      }
    }

    // Infer the language of the project if it hasn't been set yet.
    if (!projectLanguage.isSet()) {
      const languageGuess = await guessWorkspaceLanguage();
      stream.markdown("Based on the files in your workspace, ");

      if (languageGuess === "definitely_r") {
        stream.markdown("it looks like you are using R.\n\n");
        stream.progress("");
        projectLanguage.set("r");
      } else if (languageGuess === "definitely_python") {
        stream.markdown("it looks like you are using Python.\n\n");
        stream.progress("");
        projectLanguage.set("python");
      } else {
        // If we're don't know for sure what language is being used, prompt the
        // user.
        if (languageGuess === "probably_r") {
          stream.markdown(" it looks like you are probably using R.\n\n");
        } else if (languageGuess === "probably_python") {
          stream.markdown(" it looks like you are probably using Python.\n\n");
        } else {
          stream.markdown(
            " I can't infer what language you want to use for Shiny.\n\n"
          );
        }

        stream.button({
          title: "I'm using R",
          command: "shiny.assistant.setProjectLanguage",
          arguments: ["r"],
        });
        stream.button({
          title: "I'm using Python",
          command: "shiny.assistant.setProjectLanguage",
          arguments: ["python"],
        });

        showedLanguageButtons = true;
      }
    }

    // If we prompted the user for language, this will block until they choose.
    await projectLanguage.promise;

    // If we had shown the language buttons, there can be a long pause at this
    // point. Show progress so the user knows something is still happening.
    if (showedLanguageButtons) {
      stream.progress("");
    }

    // Convert the chat history to message format.
    const messages = chatContext.history.map((message) => {
      if (message instanceof vscode.ChatRequestTurn) {
        return vscode.LanguageModelChatMessage.User(message.prompt);
      } else if (message instanceof vscode.ChatResponseTurn) {
        let messageText = "";
        if (message.result.metadata?.rawResponseText) {
          // If the response has saved the raw text from the LLM, use that.
          messageText = message.result.metadata.rawResponseText;
        } else {
          // Otherwise, construct the message from the response parts. (There
          // might be multiple parts to the response if, for example, the LLM
          // calls tools.) Note that this message will consist of the text parts
          // that were streamed to the UI, which may have been transformed from
          // the raw LLM response. Additionally these text parts may include
          // content that was streamed to the UI without being part of the LLM
          // response at all, like if `stream.markdown("...")` is called
          // directly.
          message.response.forEach((r) => {
            if (r instanceof vscode.ChatResponseMarkdownPart) {
              messageText += r.value.value;
            }
          });
        }
        return vscode.LanguageModelChatMessage.Assistant(messageText);
      }
      throw new Error(`Unknown message type in chat history: ${message}`);
    });

    // Prepend system prompt to the messages.
    const systemPrompt = await loadSystemPrompt(
      extensionContext,
      projectLanguage.name()
    );
    messages.unshift(vscode.LanguageModelChatMessage.User(systemPrompt));

    // Construct a user message from the <context> blocks for the references.
    const requestReferenceContextBlocks: string[] = await createContextBlocks(
      request.references
    );
    messages.push(
      vscode.LanguageModelChatMessage.User(
        requestReferenceContextBlocks.join("\n")
      )
    );

    messages.push(vscode.LanguageModelChatMessage.User(request.prompt));

    const options: vscode.LanguageModelChatRequestOptions = {
      tools: tools,
    };

    let responseContainsShinyApp = false;
    // Collect all the raw text from the LLM. This will include the text
    // spanning multiple tool calls, if present.
    let rawResponseText = "";

    async function runWithTools() {
      const chatResponse = await request.model.sendRequest(
        messages,
        options,
        token
      );

      // Stream the response
      const toolCalls: vscode.LanguageModelToolCallPart[] = [];
      const tagProcessor = new StreamingTagProcessor(["SHINYAPP", "FILE"]);
      let shinyAppFiles: FileContentJson[] | null = null;
      // States of a state machine to handle the response
      let state: "TEXT" | "SHINYAPP" | "FILE" = "TEXT";
      // When processing text in the FILE state, the first chunk of text may have
      // a leading \n that needs to be removed;
      let fileStateProcessedFirstChunk = false;
      // The response text streamed in from the LLM.
      let thisTurnResponseText = "";

      for await (const part of chatResponse.stream) {
        if (part instanceof vscode.LanguageModelTextPart) {
          rawResponseText += part.value;
        } else if (part instanceof vscode.LanguageModelToolCallPart) {
          toolCalls.push(part);
          continue;
        } else {
          console.log("Unknown part type: ", part);
          continue;
        }

        thisTurnResponseText += part.value;
        const processedFragment = tagProcessor.process(part.value);

        for (const part of processedFragment) {
          // TODO: flush at the end?
          if (state === "TEXT") {
            if (part.type === "text") {
              stream.markdown(part.text);
            } else if (part.type === "tag") {
              if (part.kind === "open") {
                if (part.name === "SHINYAPP") {
                  state = "SHINYAPP";
                  // TODO: handle multiple shiny apps? Or just error?
                  shinyAppFiles = [];
                  responseContainsShinyApp = true;
                } else if (part.name === "FILE") {
                  console.log(
                    "Parse error: <FILE> tag found, but not in <SHINYAPP> block."
                  );
                }
              } else if (part.kind === "close") {
                console.log(
                  "Parse error: Unexpected closing tag in TEXT state."
                );
              }
            } else {
              console.log("Parse error: Unexpected part type in TEXT state.");
            }
          } else if (state === "SHINYAPP") {
            if (part.type === "text") {
              // console.log(
              //   "Parse error: Unexpected text in SHINYAPP state.",
              //   part.text,
              //   "."
              // );
              stream.markdown(part.text);
            } else if (part.type === "tag") {
              if (part.kind === "open") {
                if (part.name === "SHINYAPP") {
                  console.log(
                    "Parse error: Nested <SHINYAPP> tags are not supported."
                  );
                } else if (part.name === "FILE") {
                  state = "FILE";
                  fileStateProcessedFirstChunk = false;

                  // TODO: Handle case when NAME attribute is missing
                  shinyAppFiles!.push({
                    name: part.attributes["NAME"],
                    content: "",
                  });
                  stream.markdown("\n### " + part.attributes["NAME"] + "\n");
                  stream.markdown("```");
                  const fileType = inferFileType(part.attributes["NAME"]);
                  if (fileType !== "text") {
                    stream.markdown(fileType);
                  }
                  stream.markdown("\n");
                }
              } else if (part.kind === "close") {
                if (part.name === "SHINYAPP") {
                  if (shinyAppFiles) {
                    // Render the file tree control at a base location
                    proposedFilePreviewCounter++;
                    const proposedFilesPrefixDir =
                      "/app-preview-" + proposedFilePreviewCounter;
                    proposedFilePreviewProvider?.addFiles(
                      shinyAppFiles,
                      proposedFilesPrefixDir
                    );

                    stream.button({
                      title: "View changes as diff",
                      command: "shiny.assistant.showDiff",
                      arguments: [
                        shinyAppFiles,
                        vscode.workspace.workspaceFolders?.[0],
                        proposedFilesPrefixDir,
                      ],
                    });

                    stream.button({
                      title: "Apply changes",
                      command: "shiny.assistant.saveFilesToWorkspace",
                      arguments: [shinyAppFiles, true],
                    });

                    stream.markdown(
                      new vscode.MarkdownString(
                        `After you apply the changes, press the $(run) button in the upper right of the app.${projectLanguage.fileExt()} editor panel to run the app.\n\n`,
                        true
                      )
                    );
                  }
                  state = "TEXT";
                } else {
                  console.log(
                    "Parse error: Unexpected closing tag in SHINYAPP state."
                  );
                }
              }
            } else {
              console.log(
                "Parse error: Unexpected part type in SHINYAPP state."
              );
            }
          } else if (state === "FILE") {
            if (part.type === "text") {
              if (!fileStateProcessedFirstChunk) {
                fileStateProcessedFirstChunk = true;
                // "<FILE>" may be followed by "\n", which needs to be removed.
                if (part.text.startsWith("\n")) {
                  part.text = part.text.slice(1);
                }
              }
              stream.markdown(part.text);
              // Add text to the current file content
              shinyAppFiles![shinyAppFiles!.length - 1].content += part.text;
            } else if (part.type === "tag") {
              if (part.kind === "open") {
                console.log(
                  "Parse error: tags inside of <FILE> are not supported."
                );
              } else if (part.kind === "close") {
                if (part.name === "FILE") {
                  stream.markdown("```");
                  state = "SHINYAPP";
                } else {
                  console.log(
                    "Parse error: Unexpected closing tag in FILE state."
                  );
                }
              }
            }
          }
        }
      }

      messages.push(
        vscode.LanguageModelChatMessage.Assistant([
          new vscode.LanguageModelTextPart(thisTurnResponseText),
          ...toolCalls,
        ])
      );

      if (toolCalls.length > 0) {
        const toolCallsResults: Array<vscode.LanguageModelToolResultPart> = [];
        for (const toolCall of toolCalls) {
          const tool = tools.find((tool) => tool.name === toolCall.name);
          if (!tool) {
            console.log(`Tool not found: ${toolCall.name}`);
            continue;
          }
          const result = await tool.invoke(toolCall.input, {
            stream: stream,
            cancellationToken: dummyCancellationToken,
          });

          if (result === undefined) {
            console.log(`Tool returned undefined: ${toolCall.name}`);
            continue;
          }

          const resultWrapped = wrapToolInvocationResult(result);
          const toolCallResult = new vscode.LanguageModelToolResultPart(
            toolCall.callId,
            resultWrapped.content
          );
          toolCallsResults.push(toolCallResult);
        }
        messages.push(vscode.LanguageModelChatMessage.User(toolCallsResults));

        messages.push(
          vscode.LanguageModelChatMessage.User(
            "The messages above contain the results from one or more tool calls. The user can't see these results, so you should explain to the user if you reference them in your response."
          )
        );

        // Loop until there are no more tool calls
        stream.markdown("\n\n");
        // Add line breaks between tool call loop iterations.
        rawResponseText += "\n\n";
        return runWithTools();
      }
    }

    await runWithTools();

    chatResult.metadata.rawResponseText = rawResponseText;
    if (responseContainsShinyApp) {
      chatResult.metadata.followups.push(
        "Install the packages needed for my app."
      );
    }

    return chatResult;
  };

  const shinyAssistant = vscode.chat.createChatParticipant(
    "chat.shiny-assistant",
    handler
  );

  shinyAssistant.followupProvider = {
    provideFollowups: (
      result: ShinyAssistantChatResult,
      context: vscode.ChatContext,
      token: vscode.CancellationToken
    ): vscode.ChatFollowup[] => {
      const followups: vscode.ChatFollowup[] = result.metadata.followups.map(
        (item) => {
          if (typeof item === "string") {
            return { prompt: item, command: "" };
          } else {
            return item;
          }
        }
      );
      return followups;
    },
  };

  shinyAssistant.iconPath = vscode.Uri.joinPath(
    extensionContext.extensionUri,
    "images/assistant-icon.svg"
  );

  return shinyAssistant;
}

async function applyChangesToWorkspaceFromDiffView(): Promise<boolean> {
  return await saveFilesToWorkspace(currentDiffViewFiles, true);
}

/**
 * Handles Shiny app files by either saving them to the workspace (if available)
 * or creating untitled editors (if no workspace).
 * Returns true if all operations are successful, false otherwise.
 *
 * @param newFiles - The files to handle
 * @param closeProposedChangesTabs - Whether to close the tabs with proposed files.
 * @returns boolean indicating if all operations were successful
 */
async function saveFilesToWorkspace(
  newFiles: FileContentJson[],
  closeProposedChangesTabs: boolean = false
): Promise<boolean> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  if (!workspaceFolder) {
    vscode.window.showErrorMessage(
      "You currently do not have an active workspace folder. Please open a workspace folder and try again."
    );
    return false;
  }

  if (closeProposedChangesTabs) {
    await closeAllProposedChangesTabs();
  }

  try {
    const changedUris: vscode.Uri[] = [];
    const createdUris: vscode.Uri[] = [];
    const workspaceEdit = new vscode.WorkspaceEdit();

    // If we have a workspace, save files to disk.
    for (const newFile of newFiles) {
      const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, newFile.name);

      try {
        // Try to open existing file. If it exists, then replace its content.
        await vscode.workspace.fs.stat(fileUri);
        const document = await vscode.workspace.openTextDocument(fileUri);

        // Replace the content only if it's different.
        if (document.getText() !== newFile.content) {
          workspaceEdit.set(fileUri, [
            vscode.TextEdit.replace(
              new vscode.Range(
                document.positionAt(0),
                document.positionAt(document.getText().length)
              ),
              newFile.content
            ),
          ]);
          changedUris.push(fileUri);
        }
      } catch (err) {
        // File does not exist; create it.
        workspaceEdit.createFile(fileUri, {
          overwrite: false,
          contents: Buffer.from(newFile.content, "utf-8"),
        });
        createdUris.push(fileUri);
      }
    }

    // Applying the edit and save changed files to disk.
    await vscode.workspace.applyEdit(workspaceEdit);
    for (const uri of changedUris) {
      await vscode.workspace.save(uri);
    }

    let appFileDocument: vscode.TextDocument | null = null;
    // Open all the changed files in editors
    for (const uri of [...changedUris, ...createdUris]) {
      const document = await vscode.workspace.openTextDocument(uri);
      if (["app.R", "app.py"].includes(path.basename(uri.fsPath))) {
        appFileDocument = document;
      }
      await vscode.window.showTextDocument(document, {
        preserveFocus: false,
      });
    }

    // If there was an app.py/R, then focus on it. The reason we didn't simply
    // sort the file list and put the app.py/R last is because it usually
    // makes sense to have it first in the list of editors.
    if (appFileDocument) {
      await vscode.window.showTextDocument(appFileDocument, {
        preserveFocus: false,
      });
    }

    return true;
  } catch (error) {
    if (error instanceof Error) {
      vscode.window.showErrorMessage(
        `Failed to handle files: ${error.message}`
      );
    }
    return false;
  }
}

// Store the proposed changes that are in the current diff view in a global
// variable, so that they can be saved when the user clicks the "Apply changes"
// button.
let currentDiffViewFiles: FileContentJson[] = [];

/**
 * Shows a diff view with the proposed changes.
 *
 * @param proposedFiles - The proposed files to show in the diff view
 * @param workspaceFolder - The workspace folder to apply the changes to
 * @param proposedFilesPrefixDir - The prefix directory for the proposed files
 * @returns boolean indicating if the operation was successful
 */
async function showDiff(
  proposedFiles: FileContentJson[],
  workspaceFolder: vscode.WorkspaceFolder | undefined,
  proposedFilesPrefixDir: string
): Promise<boolean> {
  if (!workspaceFolder) {
    // TODO: Better handling here
    vscode.window.showErrorMessage(
      "You currently do not have an active workspace folder. Please open a workspace folder and try again."
    );
    return false;
  }

  // Close all other proposed changes tabs - this is necessary because if the
  // clicks the "Apply changes" button, that button can't pass arguments -- we
  // can only call the command, and if there are multiple proposed changes tabs,
  // it won't know which one to apply.
  await closeAllProposedChangesTabs();

  // We need to set some state for if the user clicks on the "Apply changes"
  // button in the diff view title bar. That calls the command
  // shiny.assistant.applyChangesToWorkspaceFromDiffView, but we can't pass
  // arguments to that command. So we'll save the new files in a global
  // variable.
  currentDiffViewFiles = proposedFiles;

  try {
    // Add files to the preview provider
    proposedFilePreviewProvider?.addFiles(proposedFiles);

    const changes: Array<[vscode.Uri, vscode.Uri, vscode.Uri]> = [];

    for (const proposedFile of proposedFiles) {
      const existingUri = vscode.Uri.joinPath(
        workspaceFolder.uri,
        proposedFile.name
      );
      let sourceUri: vscode.Uri;
      try {
        // Try reading the file from disk. We'll compare if the existing
        // contents differ from the proposed contents.
        await vscode.workspace.fs.stat(existingUri);
        const document = await vscode.workspace.openTextDocument(existingUri);
        if (document.getText() === proposedFile.content) {
          // If the contents are the unchanged, then we can ignore this file.
          continue;
        }

        sourceUri = existingUri;
      } catch {
        // If the file doesn't exist on disk, use a (virtual) empty file
        // instead.
        sourceUri = vscode.Uri.parse(
          `proposed-files://empty/${proposedFile.name}`
        );
      }

      const proposedUri = vscode.Uri.parse(
        `proposed-files://${proposedFilesPrefixDir}/${proposedFile.name}`
      );

      changes.push([
        // As far as I can tell, the label URI is completely unused.
        vscode.Uri.parse("dummy-scheme://unused-label"),
        sourceUri,
        proposedUri,
      ]);
    }
    vscode.commands.executeCommand(
      "vscode.changes",
      PROPOSED_CHANGES_TAB_LABEL,
      changes
    );

    return true;
  } catch (error) {
    console.error("Error showing diff:", error);
    return false;
  }
}

async function closeAllProposedChangesTabs() {
  const tabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs);
  const proposedFileTabs = tabs.filter((tab) => {
    return tab.isPreview && tab.label.startsWith(PROPOSED_CHANGES_TAB_LABEL);
  });

  for (const tab of proposedFileTabs) {
    await vscode.window.tabGroups.close(tab);
  }
}

/**
 * Creates `<context>` blocks for an array of chat prompt references. Each
 * reference is converted into a formatted string block containing relevant
 * context information.
 *
 * @param refs - Array of ChatPromptReference objects to process
 * @returns Promise resolving to an array of formatted context block strings
 */
async function createContextBlocks(
  refs: readonly vscode.ChatPromptReference[]
): Promise<string[]> {
  return Promise.all(refs.map(createContextBlock));
}

/**
 * Creates a single `<context>` block for a chat prompt reference. Handles
 * different types of references:
 * - Uri: Includes full file contents
 * - Location: Includes specific line range from file
 * - String: Includes the string directly
 *
 * @param ref - ChatPromptReference to process
 * @returns Promise resolving to a formatted context block string
 * @throws Error if the reference value type is not supported
 */
async function createContextBlock(
  ref: vscode.ChatPromptReference
): Promise<string> {
  const value = ref.value;

  if (value instanceof vscode.Uri) {
    const fileContents = (await vscode.workspace.fs.readFile(value)).toString();
    return `
<context>
${value.fsPath}:
\`\`\`
${fileContents}
\`\`\`
</context>
`;
  } else if (value instanceof vscode.Location) {
    const rangeText = (
      await vscode.workspace.openTextDocument(value.uri)
    ).getText(value.range);
    return `
<context>
${value.uri.fsPath}:${value.range.start.line + 1}-${value.range.end.line + 1}:
\`\`\`
${rangeText}
\`\`\`
</context>
`;
  } else if (typeof value === "string") {
    return `
<context>
${value}
</context>
`;
  } else {
    throw new Error("Unsupported value type for context block.");
  }
}

// // Example usage
// async function exampleUsage() {
//   try {
//     const pty = new MyPTY();

//     const terminal = vscode.window.createTerminal({
//       name: "My Custom Terminal",
//       pty,
//     });
//     terminal.show();

//     // Don't continue until the pseudoterminal is opened; otherwise we could
//     // write to the pty before it's ready and that output will be lost.
//     await pty.openedPromise;
//     pty.write("> ");

//     await runShellCommand({
//       cmd: "echo",
//       args: ["Hello, world!"],
//       cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
//       stdout: (s: string) => {
//         pty.write(s);
//       },
//       stderr: (s: string) => {
//         pty.write(s);
//       },
//     });
//   } catch (error) {
//     console.error("Error running command:", error);
//   }
// }
