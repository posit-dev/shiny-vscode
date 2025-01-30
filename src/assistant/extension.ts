import * as vscode from "vscode";
import { checkPythonEnvironment } from "./language";
import { ProposedFilePreviewProvider } from "./proposed-file-preview-provider";
import { StreamingTagProcessor } from "./streaming-tag-processor";
import { loadSystemPrompt } from "./system-prompt";
import type { FileContentJson } from "./types";

let proposedFilePreviewProvider: ProposedFilePreviewProvider | null = null;

// Each set of proposed files gets a unique counter value.
let proposedFilePreviewCounter = 0;

export function activateAssistant(extensionContext: vscode.ExtensionContext) {
  registerShinyChatParticipant(extensionContext);

  const writeFilesToDiskDisposable = vscode.commands.registerCommand(
    "shiny.assistant.writeFilesToDisk",
    writeFilesToDisk
  );

  // Register the provider for "proposed-files://" URIs
  proposedFilePreviewProvider = new ProposedFilePreviewProvider();
  vscode.workspace.registerTextDocumentContentProvider(
    "proposed-files",
    proposedFilePreviewProvider
  );

  extensionContext.subscriptions.push(writeFilesToDiskDisposable);

  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  checkPythonEnvironment();
}

export function deactivate() {}

export function registerShinyChatParticipant(
  extensionContext: vscode.ExtensionContext
) {
  const handler: vscode.ChatRequestHandler = async (
    request: vscode.ChatRequest,
    chatContext: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ) => {
    // Initialize the prompt
    const prompt = await loadSystemPrompt(extensionContext);

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

                  stream.markdown("Preview in editor:\n");

                  stream.filetree(
                    tree,
                    vscode.Uri.parse(
                      "proposed-files://" + proposedFilesPrefixDir
                    )
                  );

                  stream.button({
                    title: "Write files to disk",
                    command: "shiny.assistant.writeFilesToDisk",
                    arguments: [shinyAppFiles],
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
 * @returns boolean indicating if all operations were successful
 */
async function writeFilesToDisk(files: FileContentJson[]): Promise<boolean> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  if (workspaceFolder) {
    try {
      // If we have a workspace, save files to disk
      for (const file of files) {
        const filePath = vscode.Uri.joinPath(workspaceFolder.uri, file.name);
        await vscode.workspace.fs.writeFile(
          filePath,
          Buffer.from(file.content)
        );
        const document = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(document, { preview: false });
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
