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

const projectLanguagePromise: PromiseWithStatus<"r" | "python"> =
  createPromiseWithStatus<"r" | "python">();

export function activateAssistant(extensionContext: vscode.ExtensionContext) {
  registerShinyChatParticipant(extensionContext);

  const saveFilesToWorkspaceDisposable = vscode.commands.registerCommand(
    "shiny.assistant.saveFilesToWorkspace",
    saveFilesToWorkspace
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

    const prompt = await loadSystemPrompt(extensionContext, language);

    // Initialize the messages array with the prompt
    const messages = [vscode.LanguageModelChatMessage.User(prompt)];

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

    messages.push(vscode.LanguageModelChatMessage.User(request.prompt));

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
                  // const workspaceFolder = vscode.workspace.workspaceFolders![0];

                  proposedFilePreviewCounter++;
                  const proposedFilesPrefixDir =
                    "/app-preview-" + proposedFilePreviewCounter;
                  proposedFilePreviewProvider?.addFiles(
                    shinyAppFiles,
                    proposedFilesPrefixDir
                  );

                  const tree: vscode.ChatResponseFileTree[] = [
                    {
                      name: "/",
                      children: shinyAppFiles.map((f) => {
                        return { name: f.name };
                      }),
                    },
                  ];

                  stream.markdown("These are the proposed files:\n");

                  stream.filetree(
                    tree,
                    vscode.Uri.parse(
                      "proposed-files://" + proposedFilesPrefixDir
                    )
                  );

                  stream.button({
                    title: "Save files to disk",
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

/**
 * Handles Shiny app files by either saving them to the workspace (if available)
 * or creating untitled editors (if no workspace).
 * Returns true if all operations are successful, false otherwise.
 *
 * @param files - The files to handle
 * @param closeProposedFileTabs - Whether to close the tabs with proposed files.
 * @returns boolean indicating if all operations were successful
 */
async function saveFilesToWorkspace(
  files: FileContentJson[],
  closeProposedFileTabs: boolean = false
): Promise<boolean> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  if (workspaceFolder) {
    try {
      // Check for existing files first
      const existingFiles: string[] = [];
      for (const file of files) {
        const filePath = vscode.Uri.joinPath(workspaceFolder.uri, file.name);
        try {
          await vscode.workspace.fs.stat(filePath);
          existingFiles.push(file.name);
        } catch (err) {
          // File doesn't exist, which is fine
        }
      }

      // If there are existing files, prompt for confirmation
      if (existingFiles.length > 0) {
        const message =
          existingFiles.length === 1
            ? `File "${existingFiles[0]}" already exists. Do you want to overwrite it?`
            : `The following files already exist:\n${existingFiles.join("\n")}\nDo you want to overwrite them?`;

        const response = await vscode.window.showWarningMessage(
          message,
          { modal: true },
          "Yes, Overwrite",
          "No, Cancel"
        );

        if (response !== "Yes, Overwrite") {
          return false;
        }
      }

      let appFileEditor: vscode.TextEditor | null = null;
      // If we have a workspace, save files to disk.
      for (const file of files) {
        const filePath = vscode.Uri.joinPath(workspaceFolder.uri, file.name);
        await vscode.workspace.fs.writeFile(
          filePath,
          Buffer.from(file.content)
        );
        const document = await vscode.workspace.openTextDocument(filePath);

        const textEditor = await vscode.window.showTextDocument(document, {
          preview: false,
        });
        if (["app.R", "app.py"].includes(path.basename(file.name))) {
          appFileEditor = textEditor;
        }
      }
      if (closeProposedFileTabs) {
        await closeAllProposedFileTabs();
      }

      if (appFileEditor) {
        // Bring the app.py/R editor to the front and give it focus.
        await vscode.window.showTextDocument(appFileEditor.document, {
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

async function closeAllProposedFileTabs() {
  const tabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs);
  const proposedFileTabs = tabs.filter((tab) => {
    console.log(tab);
    const input = tab.input as { uri?: vscode.Uri };
    return input?.uri?.scheme === "proposed-files";
  });

  for (const tab of proposedFileTabs) {
    await vscode.window.tabGroups.close(tab);
  }
}
