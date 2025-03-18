import * as path from "path";
import * as vscode from "vscode";
import { isShinyAppFilename } from "../extension";
import { applyFileSetDiff, type DiffError } from "./diff";
import {
  inferFileType,
  langNameToFileExt,
  langNameToProperName,
  type LangName,
} from "./language";
import { checkPythonEnvironment } from "./project-language";
import { ProposedFilePreviewProvider } from "./proposed-file-preview-provider";
import { StreamingTagProcessor } from "./streaming-tag-processor";
import { loadSystemPrompt } from "./system-prompt";
import { tools, wrapToolInvocationResult } from "./tools";
import type { FileContent, FileSet } from "./types";
import { createPromiseWithStatus } from "./utils";

const proposedFilePreviewProvider = new ProposedFilePreviewProvider();

// Each set of proposed files gets a unique counter value.
let proposedFilePreviewCounter = 0;

// The label for the editor tab that shows proposed changes.
const PROPOSED_CHANGES_TAB_LABEL = "Proposed changes";

// Track assistant-specific disposables
export const assistantDisposables: vscode.Disposable[] = [];

// Variables that relate to the state of the assistant.

export type ProjectSettings = {
  language: LangName | null;
  // Current app subdirectory, relative to the workspace root, without leading
  // or trailing slashes. If null, the user has not yet chosen a subdirectory.
  appSubdir: string | null;
};

export const projectSettings: ProjectSettings = {
  language: null,
  appSubdir: null,
};

// export const projectLanguage = new PromisedValueContainer<LangName>();
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
  assistantDisposables.push(
    ...[
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
        (language: LangName, callback) => {
          projectSettings.language = language;
          callback();
        }
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
      vscode.commands.registerCommand(
        "shiny.assistant.setAppSubdir",
        setAppSubdirDialog
      ),

      vscode.workspace.registerTextDocumentContentProvider(
        "proposed-files",
        proposedFilePreviewProvider
      ),
      registerShinyChatParticipant(extensionContext),
    ]
  );

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
  assistantDisposables.length = 0;
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

    // ========================================================================
    // Commands
    // ========================================================================
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

    // ========================================================================
    // If the user isn't using Claude 3.5 Sonnet, prompt them to switch.
    // ========================================================================
    if (
      request.model.id !== "claude-3.5-sonnet" &&
      !hasConfirmedClaude.isResolved()
    ) {
      // The text displays much more quickly if we call markdown() twice instead
      // of just once.
      stream.markdown(
        `It looks like you are using **${request.model.name}** for Copilot. `
      );
      if (request.model.id.startsWith("claude-3.7-sonnet")) {
        stream.markdown(
          "**Claude 3.7 Sonnet** currently doesn't work with chat participants like `@shiny`.\n\n"
        );
      } else {
        stream.markdown(
          "For best results with `@shiny`, please switch to **Claude 3.5 Sonnet**.\n\n"
        );
      }
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

    // ========================================================================
    // Tell the user they need a workspace folder
    // ========================================================================
    let workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      stream.markdown(
        "You currently do not have an active workspace folder. You need an active workspace folder to use Shiny Assistant.\n\n"
      );
      stream.markdown(
        "Please open a folder by clicking on the **Open Folder** button in the sidebar, or by clicking on the **File** menu and then **Open Folder...** \n\n"
      );
      stream.button({
        title: `Got it, continue`,
        command: "shiny.assistant.continueAfterWorkspaceFolderSuggestion",
      });

      await hasContinuedAfterWorkspaceFolderSuggestion;
      workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        stream.markdown(
          "I'm sorry, I can't continue without an active workspace folder.\n\n"
        );
        // TODO: Can we provide a followup here that opens a dialog for the the
        // user to select a folder?
        return chatResult;
      }
    }

    const workspaceFolderUri = workspaceFolder.uri;

    // ========================================================================
    // If the currently-active file is an R or Python file, set the project
    // language to that language.
    // ========================================================================
    const activeFileReference = request.references.find(
      (ref) =>
        // This is when a file open in the editor
        (ref.id === "vscode.implicit.viewport" ||
          // This when a file is open with lines selected
          ref.id === "vscode.implicit.selection") &&
        ref.value instanceof vscode.Location &&
        ref.value.uri.scheme === "file"
    );
    let activeFileRelativePath = activeFileReference
      ? path.relative(
          workspaceFolderUri.fsPath,
          (activeFileReference.value as vscode.Location).uri.fsPath
        )
      : undefined;

    // Prepend "./" if the path doesn't contain a subdir.
    if (activeFileRelativePath && !activeFileRelativePath.match("/")) {
      activeFileRelativePath = "./" + activeFileRelativePath;
    }

    if (activeFileRelativePath) {
      // Check that the active file is a Shiny app file
      const activeFileName = path.basename(activeFileRelativePath);

      let activeFileLanguage: LangName | "other";
      if (activeFileName.toLowerCase().endsWith(".r")) {
        activeFileLanguage = "r";
      } else if (activeFileName.toLowerCase().endsWith(".py")) {
        activeFileLanguage = "python";
      } else {
        activeFileLanguage = "other";
      }

      // If we're changing the current language, let the user know.
      if (
        activeFileLanguage !== "other" &&
        projectSettings.language !== activeFileLanguage
      ) {
        projectSettings.language = activeFileLanguage;
        stream.markdown(
          `Based on the current file \`${activeFileRelativePath}\`, I see you are using ${langNameToProperName(projectSettings.language!)}.\n\n`
        );
      }
    }

    // ========================================================================
    // If the language hasn't been set yet, ask the user what they want.
    // ========================================================================
    if (projectSettings.language === null) {
      stream.markdown("What language you want to use for your Shiny app?\n\n");
      const setProjectLanguagePromise = createPromiseWithStatus<void>();

      stream.button({
        title: "I'm using R",
        command: "shiny.assistant.setProjectLanguage",
        arguments: ["r", setProjectLanguagePromise.resolve],
      });
      stream.button({
        title: "I'm using Python",
        command: "shiny.assistant.setProjectLanguage",
        arguments: ["python", setProjectLanguagePromise.resolve],
      });

      // Block until user chooses a language.
      await setProjectLanguagePromise;
      // There can be a long pause at this point. Show progress so the user knows
      // something is still happening.
      stream.progress("");
    }

    // ========================================================================
    // Possibly set the current app subdirectory
    // ========================================================================
    // If it is a Shiny app file, use its directory as the appSubdir.
    // After this point, if the user has not set the appSubdir, the LLM will
    // use a tool call to ask the user which subdirectory to use.
    if (
      activeFileRelativePath &&
      isShinyAppFilename(activeFileRelativePath, projectSettings.language!)
    ) {
      const activeFileSubdir = path.dirname(activeFileRelativePath);
      if (projectSettings.appSubdir !== activeFileSubdir) {
        projectSettings.appSubdir = activeFileSubdir;

        stream.markdown(
          `Based on the current file \`${activeFileRelativePath}\`, the app subdirectory has been set to \`${projectSettings.appSubdir}/\`.\n\n`
        );
        stream.progress("");
      }
    }

    // ========================================================================
    // Construct conversation data structure
    // ========================================================================
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
      projectSettings
    );
    messages.unshift(vscode.LanguageModelChatMessage.User(systemPrompt));

    // ========================================================================

    // Make a copy because we might mutate it.
    const requestReferences: vscode.ChatPromptReference[] = [
      ...request.references,
    ];

    // If there's an active file editor, the createContextBlock function would
    // normally only include the visible portion of the file. We want to include
    // the entire file in the context, so we'll add a reference to the entire
    // file. We don't remove the existing reference because the LLM might use
    // it to determine the visible portion of the file.
    if (activeFileReference) {
      const activeFileUri = (activeFileReference.value as vscode.Location).uri;
      const activeFileFullRef: vscode.ChatPromptReference = {
        id: activeFileUri.toString(),
        range: undefined,
        modelDescription: "file:" + path.basename(activeFileRelativePath!),
        value: activeFileUri,
      };
      requestReferences.push(activeFileFullRef);
    }

    // Construct a user message from the <context> blocks for the references.
    const requestReferenceContextBlocks: string[] = await createContextBlocks(
      requestReferences,
      workspaceFolderUri
    );
    messages.push(
      vscode.LanguageModelChatMessage.User(
        requestReferenceContextBlocks.join("\n")
      )
    );

    messages.push(vscode.LanguageModelChatMessage.User(request.prompt));

    // ========================================================================
    // Send the request to the LLM and process the response
    // ========================================================================
    const options: vscode.LanguageModelChatRequestOptions = {
      tools: tools,
    };
    let responseContainsFileSet = false;
    // Collect all the raw text from the LLM. This will include the text
    // spanning multiple tool calls, if present.
    let rawResponseText = "";

    // If there are any tool calls in the response, this function loops by
    // calling itself recursively until there are no more tool calls in the
    // response.
    async function runWithTools() {
      const chatResponse = await request.model.sendRequest(
        messages,
        options,
        token
      );

      // Stream the response
      const toolCalls: vscode.LanguageModelToolCallPart[] = [];
      const tagProcessor = new StreamingTagProcessor(["FILESET", "FILE"]);
      let fileSet: FileSet | null = null;
      let diffErrors: DiffError[] = [];
      // States of a state machine to handle the response
      let state: "TEXT" | "FILESET" | "FILE" = "TEXT";
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
                if (part.name === "FILESET") {
                  state = "FILESET";
                  // TODO: handle multiple filesets? Or just error?
                  responseContainsFileSet = true;

                  let format: "complete" | "diff" = "complete";
                  if (part.attributes["FORMAT"] === "diff") {
                    format = "diff";
                  }

                  fileSet = {
                    format: format,
                    files: [],
                  };
                } else if (part.name === "FILE") {
                  console.log(
                    "Parse error: <FILE> tag found, but not in <FILESET> block."
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
          } else if (state === "FILESET") {
            if (part.type === "text") {
              // console.log(
              //   "Parse error: Unexpected text in FILESET state.",
              //   part.text,
              //   "."
              // );
              stream.markdown(part.text);
            } else if (part.type === "tag") {
              if (part.kind === "open") {
                if (part.name === "FILESET") {
                  console.log(
                    `Parse error: <FILESET> cannot have child tag <${part.name}>.`
                  );
                } else if (part.name === "FILE") {
                  state = "FILE";
                  fileStateProcessedFirstChunk = false;

                  if (!part.attributes["NAME"]) {
                    console.log(
                      "Parse error: <FILE> tag found without NAME attribute."
                    );
                  }
                  fileSet!.files.push({
                    name: part.attributes["NAME"],
                    content: "",
                    type: "text",
                  });
                  stream.markdown("\n### " + part.attributes["NAME"] + "\n");
                  stream.markdown("```");
                  if (fileSet!.format === "diff") {
                    stream.markdown("diff");
                  } else {
                    const fileType = inferFileType(part.attributes["NAME"]);
                    if (fileType !== "text") {
                      stream.markdown(fileType);
                    }
                  }
                  stream.markdown("\n");
                }
              } else if (part.kind === "close") {
                if (part.name === "FILESET") {
                  if (fileSet) {
                    // Add files to the proposedFilePreviewProvider
                    proposedFilePreviewCounter++;
                    const proposedFilesPrefixDir =
                      "/app-preview-" + proposedFilePreviewCounter;

                    if (fileSet.format === "diff") {
                      // For each file, if it ends with a trailing "\n", remove
                      // it. This is because the LLM usually puts a "\n" before
                      // "</FILE>", but that "\n" shouldn't actually be part of
                      // the diff context.
                      for (const file of fileSet.files) {
                        if (
                          file.type === "text" &&
                          file.content.endsWith("\n")
                        ) {
                          file.content = file.content.replace(/\n$/, "");
                        }
                      }

                      const result = await applyFileSetDiff(
                        fileSet,
                        workspaceFolderUri.fsPath
                      );

                      fileSet = result.fileSet;
                      diffErrors = result.diffErrors;
                    }

                    // TODO: Remove question mark from proposedFilePreviewProvider
                    proposedFilePreviewProvider?.addFiles(
                      fileSet.files,
                      proposedFilesPrefixDir
                    );

                    stream.button({
                      title: "View changes as diff",
                      command: "shiny.assistant.showDiff",
                      arguments: [
                        fileSet,
                        workspaceFolderUri,
                        proposedFilesPrefixDir,
                      ],
                    });

                    stream.button({
                      title: "Apply changes",
                      command: "shiny.assistant.saveFilesToWorkspace",
                      arguments: [fileSet.files, true],
                    });

                    stream.markdown(
                      new vscode.MarkdownString(
                        `After you apply the changes, press the $(run) button in the upper right of the app.${langNameToFileExt(projectSettings.language!)} editor panel to run the app.\n\n`,
                        true
                      )
                    );
                  }
                  state = "TEXT";
                } else {
                  console.log(
                    "Parse error: Unexpected closing tag in FILESET state."
                  );
                }
              }
            } else {
              console.log(
                "Parse error: Unexpected part type in FILESET state."
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
              fileSet!.files[fileSet!.files.length - 1].content += part.text;
            } else if (part.type === "tag") {
              if (part.kind === "open") {
                console.log(
                  "Parse error: tags inside of <FILE> are not supported."
                );
              } else if (part.kind === "close") {
                if (part.name === "FILE") {
                  stream.markdown("```");
                  state = "FILESET";
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

      if (diffErrors.length > 0) {
        // TODO: Send error messages back to LLM
        stream.markdown(
          "The following errors occurred while applying the diff:\n\n"
        );
        stream.markdown(diffErrors.map((error) => error.message).join("\n\n"));
      }

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
            newTerminalName: "Shiny Assistant tool calls",
            // By leaving this undefined, the first tool call that needs a terminal
            // will create the Terminal, and future tool calls will reuse it.
            terminal: undefined,
            extensionContext: extensionContext,
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
        stream.progress("");
        // Add line breaks between tool call loop iterations.
        rawResponseText += "\n\n";
        return runWithTools();
      }
    }

    await runWithTools();

    chatResult.metadata.rawResponseText = rawResponseText;
    if (responseContainsFileSet) {
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
 * @param files - The files to handle
 * @param closeProposedChangesTabs - Whether to close the tabs with proposed files.
 * @returns boolean indicating if all operations were successful
 */
async function saveFilesToWorkspace(
  files: FileContent[],
  closeProposedChangesTabs: boolean = false
): Promise<boolean> {
  const workspaceFolderUri = vscode.workspace.workspaceFolders?.[0]?.uri;

  if (!workspaceFolderUri) {
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
    for (const file of files) {
      if (file.type === "binary") {
        vscode.window.showErrorMessage(
          `Failed to handle file ${file.name}: Binary files are not supported at this time.`
        );
        return false;
      }
      const fileUri = vscode.Uri.joinPath(workspaceFolderUri, file.name);

      try {
        // Try to open existing file. If it exists, then replace its content.
        await vscode.workspace.fs.stat(fileUri);
        const document = await vscode.workspace.openTextDocument(fileUri);

        // Replace the content only if it's different.
        if (document.getText() !== file.content) {
          workspaceEdit.set(fileUri, [
            vscode.TextEdit.replace(
              new vscode.Range(
                document.positionAt(0),
                document.positionAt(document.getText().length)
              ),
              file.content
            ),
          ]);
          changedUris.push(fileUri);
        }
      } catch (err) {
        // File does not exist; create it.
        workspaceEdit.createFile(fileUri, {
          overwrite: false,
          contents: Buffer.from(file.content, "utf-8"),
        });
        createdUris.push(fileUri);
      }
    }

    // Apply the edit
    await vscode.workspace.applyEdit(workspaceEdit);

    // Open all the changed files in editors
    let appFileDocument: vscode.TextDocument | null = null;
    for (const uri of [...changedUris, ...createdUris]) {
      const document = await vscode.workspace.openTextDocument(uri);
      if (["app.R", "app.py"].includes(path.basename(uri.fsPath))) {
        appFileDocument = document;
      }
      await vscode.window.showTextDocument(document, {
        preserveFocus: false,
      });
      // Save changed files to disk (file must be open in an editor to save).
      await vscode.workspace.save(uri);
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
let currentDiffViewFiles: FileContent[] = [];

/**
 * Shows a diff view with the proposed changes.
 *
 * @param proposedFiles - The proposed files to show in the diff view
 * @param workspaceFolder - The workspace folder to apply the changes to
 * @param proposedFilesPrefixDir - The prefix directory for the proposed files
 * @returns boolean indicating if the operation was successful
 */
async function showDiff(
  proposedFiles: FileSet,
  workspaceFolderUri: vscode.Uri | undefined,
  proposedFilesPrefixDir: string
): Promise<boolean> {
  if (!workspaceFolderUri) {
    // TODO: Better handling here
    vscode.window.showErrorMessage(
      "You currently do not have an active workspace folder. Please open a workspace folder and try again."
    );
    return false;
  }

  // We need to set some state for if the user clicks on the "Apply changes"
  // button in the diff view title bar. That calls the command
  // shiny.assistant.applyChangesToWorkspaceFromDiffView, but we can't pass
  // arguments to that command. So we'll save the new files in a global
  // variable.
  currentDiffViewFiles = proposedFiles.files;

  // TODO: Error on binary files

  try {
    // Add files to the preview provider
    proposedFilePreviewProvider?.addFiles(proposedFiles.files);

    const changes: Array<[vscode.Uri, vscode.Uri, vscode.Uri]> = [];

    for (const proposedFile of proposedFiles.files) {
      const existingUri = vscode.Uri.joinPath(
        workspaceFolderUri,
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
    await vscode.commands.executeCommand(
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

async function setAppSubdirDialog(
  subdir: string | null,
  callback: (success: boolean) => void
): Promise<void> {
  if (subdir === null) {
    const dialogOptions: vscode.OpenDialogOptions = {
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: "Select App Directory",
      title: "Select Shiny App Directory",
    };

    const folderUri = await vscode.window.showOpenDialog(dialogOptions);

    // If user selected a folder, set it as the app subdirectory
    if (folderUri && folderUri.length > 0) {
      // Get the selected folder path
      const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;
      const relativePath = path.relative(workspaceRoot, folderUri[0].fsPath);

      // Set the selected folder as the app subdirectory
      projectSettings.appSubdir = relativePath;
      callback(true);
    }
  } else {
    // Strip leading and trailing slashes
    subdir = subdir.replace(/^\/|\/$/g, "");

    projectSettings.appSubdir = subdir;
    callback(true);
  }
  callback(false);
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
  refs: Readonly<vscode.ChatPromptReference[]>,
  workspaceFolderUri: vscode.Uri
): Promise<string[]> {
  return Promise.all(
    refs.map((ref) => createContextBlock(ref, workspaceFolderUri))
  );
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
  ref: Readonly<vscode.ChatPromptReference>,
  workspaceFolderUri: vscode.Uri
): Promise<string> {
  const value = ref.value;

  if (value instanceof vscode.Uri) {
    const relativePath = path.relative(workspaceFolderUri.fsPath, value.fsPath);
    const fileContents = (await vscode.workspace.fs.readFile(value)).toString();
    return `
<context>
${relativePath}:
\`\`\`
${fileContents}
\`\`\`
</context>
`;
  } else if (value instanceof vscode.Location) {
    const relativePath = path.relative(
      workspaceFolderUri.fsPath,
      value.uri.fsPath
    );
    const rangeText = (
      await vscode.workspace.openTextDocument(value.uri)
    ).getText(value.range);
    return `
<context>
${relativePath}:${value.range.start.line + 1}-${value.range.end.line + 1}:
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
