import * as vscode from "vscode";
import { LLM, providerNameFromModelName } from "./llm";
import { loadSystemPrompt } from "./system-prompt";

export type Message = {
  role: "assistant" | "user";
  content: string;
};

// The state of the extension
type ExtensionState = {
  messages: Array<Message>;
};

// The state that is persisted across restarts.
type ExtensionSaveState = {
  messages: Array<Message>;
};

// The state that is sent to the webview. This is a subset of the extension
// state. In the future it might not be a strict subset; it might have some
// different information, like if the user's view of the messages is different
// from the actual messages sent to the LLM.
export type ToWebviewStateMessage = {
  model: string;
  messages: Array<Message>;
  hasApiKey: boolean;
};

let systemPrompt = "";

// The chat messages that are shown with a new chat.
const initialChatMessages: Array<Message> = [];

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

  public sendMessage(message: string) {
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
    const webviewState: ToWebviewStateMessage = {
      model: llm?.modelName || "",
      messages: state.messages,
      hasApiKey: llm?.apiKey !== "",
    };

    this._view?.webview.postMessage({
      type: "currentState",
      data: webviewState,
    });
  }

  private async handleUserInput(message: string) {
    if (!llm) {
      console.error("LLM is not initialized!");
      return;
    }
    state.messages.push({ role: "user", content: message });
    // Create a placeholder for the assistant's message
    const assistantMessage: Message = { role: "assistant", content: "" };

    try {
      const { textStream } = llm.streamText(message);

      for await (const textPart of textStream) {
        assistantMessage.content += textPart;

        // Send the streaming update to the webview
        // TODO: Stream changes instead of sending whole message
        this._view?.webview.postMessage({
          type: "streamContent",
          data: {
            messageIndex: state.messages.length,
            content: assistantMessage.content,
          },
        });
      }

      // Check for and write any files in shinyapp blocks
      await writeShinyAppFiles(assistantMessage.content);

      state.messages.push(assistantMessage);
      saveState(this.context);
    } catch (error) {
      console.error("Error:", error);
      // Handle error appropriately
    }
  }
}

/**
 * Extracts files from shinyapp blocks and writes them to disk.
 * Returns true if any files were written, false otherwise.
 *
 * @param content - The text content containing Shiny app code blocks
 * @returns boolean indicating if any files were written
 */
async function writeShinyAppFiles(content: string): Promise<boolean> {
  console.log("writeShinyAppFiles called");
  const shinyAppBlocks =
    content.match(/<SHINYAPP AUTORUN="[01]">[\s\S]*?<\/SHINYAPP>/g) || [];
  let filesWritten = false;

  for (const block of shinyAppBlocks) {
    const files = block.match(/<FILE NAME="[^"]+">[\s\S]*?<\/FILE>/g) || [];

    console.log("files: ", files);
    for (const file of files) {
      console.log("FILE: ", file);
      const nameMatch = file.match(/<FILE NAME="([^"]+)">/);
      if (!nameMatch) continue;

      const fileName = nameMatch[1];
      const fileContent = file
        .replace(/<FILE NAME="[^"]+">|<\/FILE>/g, "")
        .trim();

      console.log("fileContent: ", fileContent);

      // Create the file
      console.log("workspace: ", vscode.workspace);
      console.log("workspaceFolders: ", vscode.workspace.workspaceFolders);
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      console.log("workspaceFolder: ", workspaceFolder);
      if (!workspaceFolder) continue;

      const filePath = vscode.Uri.joinPath(workspaceFolder.uri, fileName);
      console.log("filePath: ", filePath);

      try {
        await vscode.workspace.fs.writeFile(filePath, Buffer.from(fileContent));
        filesWritten = true;

        // Open the file in the editor
        const document = await vscode.workspace.openTextDocument(filePath);
        console.log("document: ", document);
        await vscode.window.showTextDocument(document, { preview: false });
      } catch (error) {
        console.error(`Error writing file ${fileName}:`, error);
        vscode.window.showErrorMessage(`Failed to write file ${fileName}`);
      }
    }
  }

  return filesWritten;
}
