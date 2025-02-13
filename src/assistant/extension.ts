import * as path from "path";
import * as vscode from "vscode";
import { checkPythonEnvironment, guessWorkspaceLanguage } from "./language";
import { ProposedFilePreviewProvider } from "./proposed-file-preview-provider";
import { StreamingTagProcessor } from "./streaming-tag-processor";
import { loadSystemPrompt } from "./system-prompt";
import type { FileContentJson } from "./types";
import {
  capitalizeFirst,
  createPromiseWithStatus,
  type PromiseWithStatus,
} from "./utils";

let proposedFilePreviewProvider: ProposedFilePreviewProvider | null = null;

// Each set of proposed files gets a unique counter value.
let proposedFilePreviewCounter = 0;

// The label for the editor tab that shows proposed changes.
const PROPOSED_CHANGES_TAB_LABEL = "Proposed changes";

const projectLanguagePromise: PromiseWithStatus<"r" | "python"> =
  createPromiseWithStatus<"r" | "python">();

export function activateAssistant(extensionContext: vscode.ExtensionContext) {
  registerShinyChatParticipant(extensionContext);

  const saveFilesToWorkspaceDisposable = vscode.commands.registerCommand(
    "shiny.assistant.saveFilesToWorkspace",
    saveFilesToWorkspace
  );
  const applyChangesToWorkspaceFromDiffViewDisposable =
    vscode.commands.registerCommand(
      "shiny.assistant.applyChangesToWorkspaceFromDiffView",
      applyChangesToWorkspaceFromDiffView
    );
  const showDiffDisposable = vscode.commands.registerCommand(
    "shiny.assistant.showDiff",
    showDiff
  );
  const setProjectLanguageDisposable = vscode.commands.registerCommand(
    "shiny.assistant.setProjectLanguage",
    (language: "r" | "python") => {
      projectLanguagePromise.resolve(language);
    }
  );

  // Register the provider for "proposed-files://" URIs
  proposedFilePreviewProvider = new ProposedFilePreviewProvider();
  const registerTextDocumentContentProviderDisposable =
    vscode.workspace.registerTextDocumentContentProvider(
      "proposed-files",
      proposedFilePreviewProvider
    );

  extensionContext.subscriptions.push(saveFilesToWorkspaceDisposable);
  extensionContext.subscriptions.push(
    applyChangesToWorkspaceFromDiffViewDisposable
  );
  extensionContext.subscriptions.push(showDiffDisposable);
  extensionContext.subscriptions.push(setProjectLanguageDisposable);
  extensionContext.subscriptions.push(
    registerTextDocumentContentProviderDisposable
  );

  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  checkPythonEnvironment();
}

export function deactivateAssistant() {}

export function registerShinyChatParticipant(
  extensionContext: vscode.ExtensionContext
) {
  const handler: vscode.ChatRequestHandler = async (
    request: vscode.ChatRequest,
    chatContext: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ) => {
    if (!projectLanguagePromise.completed()) {
      const languageGuess = await guessWorkspaceLanguage();

      if (languageGuess === "definitely_r") {
        stream.markdown(
          "Based on the files in your workspace, it looks like you are using R.\n\n"
        );
        projectLanguagePromise.resolve("r");
      } else if (languageGuess === "definitely_python") {
        stream.markdown(
          "Based on the files in your workspace, it looks like you are using Python.\n\n"
        );
        projectLanguagePromise.resolve("python");
      } else {
        // If we're don't know for sure what language is being used, prompt the
        // user.
        if (languageGuess === "probably_r") {
          stream.markdown(
            "Based on the files in your workspace, it looks like you are probably using R.\n\n"
          );
        } else if (languageGuess === "probably_python") {
          stream.markdown(
            "Based on the files in your workspace, it looks like you are probably using Python.\n\n"
          );
        } else {
          stream.markdown(
            "Based on the files in your workspace, I can't infer what language you want to use for Shiny.\n\n"
          );
        }

        // const languageSelectionPrompt = new vscode.MarkdownString(
        //   "|    |    |\n" +
        //   "|----|----|\n" +
        //     "| [I'm using R](command:shiny.assistant.setProjectLanguageR) | [I'm using Python](command:shiny.assistant.setProjectLanguagePython) |\n\n"
        // );
        // languageSelectionPrompt.isTrusted = {
        //   enabledCommands: [
        //     "shiny.assistant.setProjectLanguageR",
        //     "shiny.assistant.setProjectLanguagePython",
        //   ],
        // };

        // stream.markdown(languageSelectionPrompt);

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
      }
    }

    // If we prompted the user for language, this will block until they choose.
    const language = await projectLanguagePromise;

    stream.progress("");

    const systemPrompt = await loadSystemPrompt(extensionContext, language);

    // Initialize the messages array with the prompt
    const messages = [vscode.LanguageModelChatMessage.User(systemPrompt)];

    // Get all the previous participant messages
    const previousMessages = chatContext.history.filter(
      (h) => h instanceof vscode.ChatResponseTurn
    );

    // Add the previous messages to the messages array
    previousMessages.forEach((m) => {
      let fullMessage = "";
      m.response.forEach((r) => {
        const mdPart = r as vscode.ChatResponseMarkdownPart;
        fullMessage += mdPart.value.value;
      });
      messages.push(vscode.LanguageModelChatMessage.Assistant(fullMessage));
    });

    // Construct the user message from the <context> blocks for the references,
    // and the literal user-submitted prompt.
    const requestReferenceContextBlocks: string[] = await createContextBlocks(
      request.references
    );
    const requestPrompt =
      requestReferenceContextBlocks.join("\n") + "\n" + request.prompt;

    messages.push(vscode.LanguageModelChatMessage.User(requestPrompt));

    const chatResponse = await request.model.sendRequest(messages, {}, token);

    // Stream the response
    const tagProcessor = new StreamingTagProcessor(["SHINYAPP", "FILE"]);
    let shinyAppFiles: FileContentJson[] | null = null;
    // States of a state machine to handle the response
    let state: "TEXT" | "SHINYAPP" | "FILE" = "TEXT";
    // When processing text in the FILE state, the first chunk of text may have
    // a leading \n that needs to be removed;
    let fileStateProcessedFirstChunk = false;

    for await (const fragment of chatResponse.text) {
      const processedFragment = tagProcessor.process(fragment);

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
              } else if (part.name === "FILE") {
                console.log(
                  "Parse error: <FILE> tag found, but not in <SHINYAPP> block."
                );
              }
            } else if (part.kind === "close") {
              console.log("Parse error: Unexpected closing tag in TEXT state.");
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
                stream.markdown("**`" + part.attributes["NAME"] + "`**\n");
                // TODO: Get filetype
                stream.markdown("```python\n");
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

                  // const tree: vscode.ChatResponseFileTree[] = [
                  //   {
                  //     name: "/",
                  //     children: shinyAppFiles.map((f) => {
                  //       return { name: f.name };
                  //     }),
                  //   },
                  // ];

                  // stream.markdown("These are the proposed files:\n");

                  // stream.filetree(
                  //   tree,
                  //   vscode.Uri.parse(
                  //     "proposed-files://" + proposedFilesPrefixDir
                  //   )
                  // );

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
                }
                state = "TEXT";
              } else {
                console.log(
                  "Parse error: Unexpected closing tag in SHINYAPP state."
                );
              }
            }
          } else {
            console.log("Parse error: Unexpected part type in SHINYAPP state.");
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

    return;
  };

  const shinyAssistant = vscode.chat.createChatParticipant(
    "chat-tutorial.shiny-assistant",
    handler
  );

  shinyAssistant.iconPath = vscode.Uri.joinPath(
    extensionContext.extensionUri,
    "images/assistant-icon.svg"
  );
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

  if (workspaceFolder) {
    if (closeProposedChangesTabs) {
      await closeAllProposedChangesTabs();
    }

    try {
      const changedUris: vscode.Uri[] = [];
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
          changedUris.push(fileUri);
        }
      }

      await vscode.workspace.applyEdit(workspaceEdit);

      let appFileDocument: vscode.TextDocument | null = null;
      // Open all the changed files in editors
      for (const uri of changedUris) {
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
  } else {
    // If no workspace, create untitled editors
    vscode.window.showErrorMessage(
      "You currently do not have an active workspace folder. Please open a workspace folder and try again."
    );
  }
  return false;
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
  // shiny.assistant.saveFilesToWorkspaceFromDiffView, but we can't pass
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
