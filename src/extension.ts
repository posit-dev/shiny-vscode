import * as vscode from "vscode";
import { activateAssistant, deactivateAssistant } from "./assistant/extension";
import { initializeParsers } from "./diagnostics/parser";
import {
  ShinyDiagnosticsController,
  validateShinyDocument,
} from "./diagnostics/validator";
import { handlePositShinyUri } from "./extension-onUri";
import {
  onDidStartDebugSession,
  pyDebugApp,
  pyRunApp,
  registerTerminalCloseHandler,
  rRunApp,
  setAppRunningStateChangeCallback,
  stopApp,
} from "./run";
import { setRunFromOverride } from "./set-run-from-override-command";
import { isShinyAppFilename, isShinyCode } from "./shiny-detection";
import {
  shinyliveCreateFromActiveEditor,
  shinyliveCreateFromExplorer,
  shinyliveSaveAppFromUrl,
} from "./shinylive";
export { isShinyAppFilename, isShinyAppRPart } from "./shiny-detection";

let diagnosticsController: ShinyDiagnosticsController | undefined;

async function validateActiveApp(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage("No active editor found to validate.");
    return;
  }

  const diags = validateShinyDocument(editor.document);
  diagnosticsController?.updateDiagnostics(editor.document);

  if (diags.length > 0) {
    vscode.window.showErrorMessage(
      `Shiny: Found ${diags.length} potential issue(s). Check the Problems panel for details.`
    );
  }
}

export async function activate(context: vscode.ExtensionContext) {
  console.log("Activating Shiny extension");
  await initializeParsers();
  diagnosticsController = new ShinyDiagnosticsController();

  context.subscriptions.push(
    diagnosticsController,
    vscode.commands.registerCommand("shiny.validateApp", validateActiveApp),
    vscode.commands.registerCommand("shiny.python.runApp", pyRunApp),
    vscode.commands.registerCommand("shiny.python.debugApp", pyDebugApp),
    vscode.commands.registerCommand("shiny.r.runApp", rRunApp),
    vscode.commands.registerCommand("shiny.stopApp", stopApp),
    vscode.commands.registerCommand(
      "shiny.setRunFromOverride",
      setRunFromOverride
    ),
    vscode.commands.registerCommand(
      "shiny.shinylive.createFromActiveEditor",
      shinyliveCreateFromActiveEditor
    ),
    vscode.commands.registerCommand(
      "shiny.shinylive.saveAppFromUrl",
      shinyliveSaveAppFromUrl
    ),
    vscode.commands.registerCommand(
      "shiny.shinylive.createFromExplorer",
      shinyliveCreateFromExplorer
    ),
    vscode.window.registerUriHandler({
      async handleUri(uri: vscode.Uri): Promise<void> {
        await handlePositShinyUri(uri);
      },
    }),
    registerTerminalCloseHandler()
  );

  // Track app running state for stop button visibility.
  // Note that in Positron, the Viewer pane also has its own stop button via
  // PreviewSource, which is independent of this.
  // This context controls the visibility of the stop button in package.json menus.
  setAppRunningStateChangeCallback((running) => {
    vscode.commands.executeCommand("setContext", "shiny.appRunning", running);
  });
  vscode.commands.executeCommand("setContext", "shiny.appRunning", false);

  activateAssistant(context);

  const throttledUpdateContext = new Throttler(2000, () => {
    updateContext("python");
    updateContext("r");
  });
  context.subscriptions.push(throttledUpdateContext);

  // When switching between text editors, immediately update.
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(
      throttledUpdateContext.immediateCall.bind(throttledUpdateContext)
    )
  );

  // When text changes in the active text editor's document, update, but not too
  // often. (Because we scan the document looking for "shiny"--maybe this can be
  // expensive)
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (vscode.window.activeTextEditor?.document === e.document) {
        throttledUpdateContext.normalCall();
      }
    })
  );
  throttledUpdateContext.immediateCall();

  vscode.debug.onDidStartDebugSession(onDidStartDebugSession);
}

// this method is called when your extension is deactivated
export function deactivate() {
  deactivateAssistant();
  diagnosticsController?.dispose();
  diagnosticsController = undefined;
}

function updateContext(language: "python" | "r"): boolean {
  const shinyContext = `shiny.${language}.active`;
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.commands.executeCommand("setContext", shinyContext, false);
    return false;
  }

  const active =
    editor.document.languageId === language &&
    !editor.document.isUntitled &&
    !!editor.document.fileName &&
    isShinyAppFilename(editor.document.fileName, language) &&
    isShinyCode(editor.document.getText(), language);

  vscode.commands.executeCommand("setContext", shinyContext, active);
  return active;
}

class Throttler {
  _thresholdMillis: number;
  _callback: () => void;
  _timeout: NodeJS.Timeout | null;
  _pending: boolean;

  constructor(thresholdMillis: number, callback: () => void) {
    this._thresholdMillis = thresholdMillis;
    this._callback = callback;
    this._timeout = null;
    this._pending = false;
  }

  // Callback now if we're not within thresholdMillis of the previous callback.
  // If we are, wait until we're no longer within thresholdMillis, then
  // callback.
  normalCall() {
    // Already a call scheduled
    if (!this._timeout) {
      this._invoke();
    } else {
      this._pending = true;
    }
  }

  // Callback immediately, regardless of when the last callback was; and cancel
  // pending callback, if any.
  immediateCall() {
    this._invoke();
  }

  _invoke() {
    this._clearTimer();
    this._pending = false;

    try {
      this._callback();
    } finally {
      this._timeout = setTimeout(() => {
        this._clearTimer();
        if (this._pending) {
          this._invoke();
        }
      }, this._thresholdMillis);
    }
  }

  _clearTimer() {
    if (this._timeout) {
      clearTimeout(this._timeout);
      this._timeout = null;
    }
  }

  dispose() {
    this._clearTimer();
    this._pending = false;
  }
}
