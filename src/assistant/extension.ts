import { tool, type CoreAssistantMessage, type CoreMessage } from "ai";
import { parse } from "partial-json";
import * as vscode from "vscode";
import { z } from "zod";
import { LLM, providerNameFromModelName } from "./llm";
import { loadSystemPrompt } from "./system-prompt";
import { ExtensionToWebviewMessage, FileContentJson } from "./types";

// The state of the extension
type ExtensionState = {
  messages: Array<CoreMessage>;
};

// The state that is persisted across restarts.
type ExtensionSaveState = {
  messages: Array<CoreMessage>;
};

let systemPrompt = "";

// The chat messages that are shown with a new chat.
const initialChatMessages: Array<CoreMessage> = [];

let state: ExtensionState = {
  messages: structuredClone(initialChatMessages),
};

let llm: LLM | null = null;

export async function activateAssistant(context: vscode.ExtensionContext) {
  // Load saved state or use default
  state = context.globalState.get<ExtensionState>("savedState") || state;

  updateLLMConfigFromSettings();

  systemPrompt = await loadSystemPrompt(context);

  const provider = new ShinyAssistantViewProvider(
    context.extensionUri,
    context
  );

  // Add configuration change listener
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("shiny.assistant")) {
        updateLLMConfigFromSettings();
        provider.sendCurrentStateToWebView();
      }
    })
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("shiny.assistant.view", provider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("shiny.assistant.clearChat", () => {
      provider.clearChat();
    })
  );
}

export function deactivate(context: vscode.ExtensionContext) {
  saveState(context);
}

/**
 * Updates the LLM configuration based on the current VS Code settings. This
 * function retrieves the LLM model and API key from the workspace
 * configuration, determines the appropriate provider, and updates the state
 * with a new LLM instance. If the provider or model is not set, the LLM in the
 * state is set to null.
 */
function updateLLMConfigFromSettings() {
  const llmModel = vscode.workspace
    .getConfiguration("shiny.assistant")
    .get("model") as string;

  const llmProvider = providerNameFromModelName(llmModel);

  const apiKey =
    (vscode.workspace
      .getConfiguration("shiny.assistant")
      .get(llmProvider + "ApiKey") as string) || "";

  if (llmProvider === null || llmModel === "") {
    llm = null;
  } else {
    llm = new LLM(llmProvider, llmModel, apiKey);
  }
}

function saveState(context: vscode.ExtensionContext) {
  const saveState: ExtensionSaveState = {
    messages: state.messages,
  };

  context.globalState.update("savedState", saveState);
}

class ShinyAssistantViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "shiny.assistant.view";
  public _view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.onDidChangeVisibility(() => {
      console.log("Shiny Assistant webview visibility changed");
    });

    webviewView.onDidDispose(() => {
      console.log("Shiny Assistant webview disposed");
    });

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      (message) => {
        if (message.type === "getState") {
          this.sendCurrentStateToWebView();
        } else if (message.type === "userInput") {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          this.handleUserInput(message.content);
        } else {
          console.log(
            "Shiny Assistant extension received message with unknown type: ",
            message
          );
        }
      },
      undefined,
      this.context.subscriptions
    );
  }

  public postMessageToWebview(message: ExtensionToWebviewMessage) {
    this._view?.webview.postMessage(message);
  }

  private getHtmlForWebview(webview: vscode.Webview) {
    const scriptPathOnDisk = vscode.Uri.joinPath(
      this.extensionUri,
      "out",
      "webview",
      "main.js"
    );
    const stylePathOnDisk = vscode.Uri.joinPath(
      this.extensionUri,
      "out",
      "webview",
      "main.css"
    );

    const scriptUri = webview.asWebviewUri(scriptPathOnDisk);
    const styleUri = webview.asWebviewUri(stylePathOnDisk);

    // Update the CSP to include necessary permissions for React
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} https: data:`,
      `script-src ${webview.cspSource} 'unsafe-inline' 'unsafe-eval'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      `connect-src ${webview.cspSource} https:`,
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en" style="height: 100%">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <title>Shiny Assistant</title>
    <link href="${styleUri}" rel="stylesheet">
    <style>
      body {
        padding: 0;
        margin: 0;
        height: 100%;
      }
      #root {
        height: 100%;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${scriptUri}"></script>
  </body>
</html>`;
  }

  public clearChat() {
    state.messages = structuredClone(initialChatMessages);
    saveState(this.context);

    this.sendCurrentStateToWebView();
  }

  public sendCurrentStateToWebView() {
    const webviewStateMessage: ExtensionToWebviewMessage = {
      type: "state",
      state: {
        model: llm?.modelName || "",
        messages: state.messages,
        hasApiKey: llm?.apiKey !== "",
      },
    };

    this.postMessageToWebview(webviewStateMessage);
  }

  private async handleUserInput(message: string) {
    if (!llm) {
      console.error("LLM is not initialized!");
      return;
    }
    state.messages.push({ role: "user", content: message });
    // Create a placeholder for the assistant's message
    const assistantMessage: CoreAssistantMessage = {
      role: "assistant",
      content: "",
    };

    try {
      const { fullStream } = llm.streamText({
        system: systemPrompt,
        messages: state.messages,
        tools: {
          writeShinyAppFiles: tool({
            description: "Write Shiny app files to disk",
            parameters: z.object({
              files: z
                .array(
                  z.object({
                    name: z.string().describe("File name"),
                    content: z.string().describe("File content"),
                  })
                )
                .describe("Array of files to write"),
            }),
            execute: async ({ files }: { files: FileContentJson[] }) => {
              return await writeShinyAppFiles(files);
            },
          }),
        },
      });

      const toolCallResponsesRaw: Record<string, string> = {};
      const toolCallResponsesParsed: Record<
        string,
        Array<FileContentJson>
      > = {};

      for await (const part of fullStream) {
        if (part.type === "text-delta") {
          assistantMessage.content += part.textDelta;
        } else if (part.type === "tool-call-streaming-start") {
          if (part.toolName !== "writeShinyAppFiles") {
            // At some point in the future, we can add a registry for handling
            // tool calls as they stream in. For now, we only handle
            // writeShinyAppFiles.
            console.error(
              "Don't know how to handle streaming tool call: " + part.toolName
            );
            continue;
          }
          toolCallResponsesRaw[part.toolCallId] = "";
          toolCallResponsesParsed[part.toolCallId] = [];
        } else if (part.type === "tool-call-delta") {
          if (part.toolName !== "writeShinyAppFiles") {
            continue;
          }
          toolCallResponsesRaw[part.toolCallId] += part.argsTextDelta;

          if (toolCallResponsesRaw[part.toolCallId] !== "") {
            const parsed = parse(toolCallResponsesRaw[part.toolCallId]);
            if (parsed.files !== undefined) {
              toolCallResponsesParsed[part.toolCallId] = parsed.files;
            }
          }
        } else if (part.type === "tool-call") {
          // End of tool call streaming
        }

        let fileContent = "";
        for (const toolCallResponse of Object.values(toolCallResponsesParsed)) {
          fileContent += fileContentsJsonToShinyAppString(toolCallResponse);
        }
        // Send the streaming update to the webview
        // TODO: Stream changes instead of sending whole message
        this.postMessageToWebview({
          type: "streamContent",
          data: {
            messageIndex: state.messages.length,
            content: assistantMessage.content + fileContent,
          },
        });
      }

      state.messages.push(assistantMessage);
      saveState(this.context);
    } catch (error) {
      console.error("Error:", error);
      // Handle error appropriately
    }
  }
}

// Function to convert FileContentJson objects into a string with format:
// <SHINYAPP AUTORUN="1"><FILE NAME="app.py">content</FILE></SHINYAPP>
function fileContentsJsonToShinyAppString(files: FileContentJson[]): string {
  if (files.length === 0) {
    return "";
  }

  let result = '<SHINYAPP AUTORUN="1">\n';
  for (const file of files) {
    if (!file.name || !file.content) {
      continue;
    }
    result += `<FILE NAME="${file.name}">${file.content}</FILE>\n`;
  }
  result += "</SHINYAPP>\n";
  return result;
}

/**
 * Extracts files from shinyapp blocks and writes them to disk.
 * Returns true if all files are written successfully, false otherwise.
 *
 * @param files - The files to write
 * @returns boolean indicating if all files were written
 */
async function writeShinyAppFiles(files: FileContentJson[]): Promise<boolean> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) return false;

  try {
    for (const file of files) {
      const filePath = vscode.Uri.joinPath(workspaceFolder.uri, file.name);

      await vscode.workspace.fs.writeFile(filePath, Buffer.from(file.content));

      const document = await vscode.workspace.openTextDocument(filePath);
      await vscode.window.showTextDocument(document, { preview: false });
    }
    return true;
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error writing files:", error.message);
      vscode.window.showErrorMessage(`Failed to write files: ${error.message}`);
    } else {
      console.error("Error writing files:", error);
      vscode.window.showErrorMessage("Failed to write files");
    }
    return false;
  }
}
