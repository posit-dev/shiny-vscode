import * as vscode from "vscode";
import { checkPythonEnvironment } from "./lang-python";
import { ProposedFilePreviewProvider } from "./proposed-file-preview-provider";
import { loadSystemPrompt } from "./system-prompt";

export type FileContentJson = {
  name: string;
  content: string;
  type?: "text" | "binary";
};

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

function inferFileType(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  switch (ext) {
    case ".py":
      return "python";
    case ".r":
      return "r";
    default:
      return "text";
  }
}

export interface ShinyAppFilesResult {
  files: FileContentJson[];
}

type ProcessedText = {
  type: "text";
  text: string;
};

type ProcessedTag = {
  type: "tag";
  name: string;
  kind: "open" | "close";
  attributes: Record<string, string>;
};

class StreamingTagProcessor {
  private buffer: string = "";
  private readonly tagPatterns: RegExp[];
  private readonly closingTagPatterns: RegExp[];

  /**
   * Creates a new StreamingTagProcessor that looks for specified XML-style tags.
   * @param tagNames - Array of tag names without angle brackets or attributes
   *                  (e.g., ["SHINYAPP", "FILE"])
   */
  constructor(tagNames: string[]) {
    // Match opening tags with optional attributes
    this.tagPatterns = tagNames.map((tagName) => {
      return new RegExp(`<${tagName}(?:\\s+[^>]*)?>`);
    });
    // Match closing tags
    this.closingTagPatterns = tagNames.map((tagName) => {
      return new RegExp(`</${tagName}>`);
    });
  }

  private parseAttributes(tagContent: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    const matches = tagContent.matchAll(/(\w+)="([^"]*)"/g);
    for (const match of matches) {
      if (match[1] && match[2] !== undefined) {
        attributes[match[1]] = match[2];
      }
    }
    return attributes;
  }

  /**
   * Processes a chunk of text to identify and handle specific tags. Accumulates
   * text until a complete tag is found, then returns the text before the tag.
   * If no complete tag is found, keeps the text in the buffer for the next
   * call.
   *
   * @param chunk - The chunk of text to process.
   * @returns - The text before the tag or potential tag, or an empty string if
   * there is no such text.
   */
  process(chunk: string): Array<ProcessedText | ProcessedTag> {
    this.buffer += chunk;
    const result: Array<ProcessedText | ProcessedTag> = [];

    let currentIndex = 0;
    let potentialTagStart = this.buffer.indexOf("<", currentIndex);

    while (potentialTagStart !== -1) {
      // Add text before potential tag to result, if there was any
      if (potentialTagStart > currentIndex) {
        result.push({
          type: "text",
          text: this.buffer.slice(currentIndex, potentialTagStart),
        });
        // this.buffer = this.buffer.slice(potentialTagStart);
      }

      const potentialTagEnd = this.buffer.indexOf(">", potentialTagStart);

      if (potentialTagEnd === -1) {
        // No tag end found, keep remaining text in buffer
        this.buffer = this.buffer.slice(potentialTagStart);
        return result;
      }

      const potentialTag = this.buffer.slice(
        potentialTagStart,
        potentialTagEnd + 1
      );

      // First check if it's a closing tag
      const matchedClosingPattern = this.closingTagPatterns.find((pattern) =>
        pattern.test(potentialTag)
      );

      if (matchedClosingPattern) {
        const tagName = matchedClosingPattern.source.match(/<\\\/(\w+)/)![1];

        result.push({
          type: "tag",
          name: tagName,
          attributes: {},
          kind: "close",
        });

        currentIndex = potentialTagEnd + 1;
      } else {
        // Check if it's an opening tag
        const matchedPattern = this.tagPatterns.find((pattern) =>
          pattern.test(potentialTag)
        );

        if (matchedPattern) {
          const tagName = matchedPattern.source.match(/<(\w+)/)![1];

          const attributesPart = potentialTag
            .slice(tagName.length + 2, -1)
            .trim();

          result.push({
            type: "tag",
            name: tagName,
            attributes: this.parseAttributes(attributesPart),
            kind: "open",
          });

          currentIndex = potentialTagEnd + 1;
        } else if (this.couldBeIncompleteMatch(potentialTag)) {
          this.buffer = this.buffer.slice(currentIndex);
          return result;
        } else {
          result.push({
            type: "text",
            text: potentialTag,
          });
          currentIndex = potentialTagEnd + 1;
        }
      }

      potentialTagStart = this.buffer.indexOf("<", currentIndex);
    }

    // Add remaining text if any
    if (currentIndex < this.buffer.length) {
      result.push({
        type: "text",
        text: this.buffer.slice(currentIndex),
      });
      this.buffer = "";
    } else if (currentIndex === this.buffer.length) {
      this.buffer = "";
    }

    return result;
  }

  private couldBeIncompleteMatch(partial: string): boolean {
    return [...this.tagPatterns, ...this.closingTagPatterns].some((pattern) => {
      const patternStr = pattern.source;
      const partialPattern = new RegExp(
        "^" + partial.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      );
      return partialPattern.test(patternStr);
    });
  }

  flush(): string | null {
    if (this.buffer.length === 0) {
      return null;
    }
    const result = this.buffer;
    this.buffer = "";
    return result;
  }
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
