import * as vscode from "vscode";
import * as path from "path";
import { runApp, debugApp, onDidStartDebugSession } from "./run";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("shiny.python.runApp", runApp),
    vscode.commands.registerCommand("shiny.python.debugApp", debugApp)
  );

  const throttledUpdateContext = new Throttler(2000, updateContext);
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
export function deactivate() {}

function updateContext(): boolean {
  const editor = vscode.window.activeTextEditor;
  const active =
    !!editor &&
    editor.document.languageId === "python" &&
    !editor.document.isUntitled &&
    !!editor.document.fileName &&
    isShinyAppUsername(editor.document.fileName) &&
    editor.document.getText().search(/\bshiny\b/) >= 0;
  vscode.commands.executeCommand("setContext", "shiny.python.active", active);
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

function isShinyAppUsername(filename: string): boolean {
  filename = path.basename(filename);

  // Only .py files
  if (!/\.py$/i.test(filename)) {
    return false;
  }

  // Accepted patterns:
  // app.py
  // app-*.py
  // app_*.py
  // *-app.py
  // *_app.py
  if (/^app\.py$/i.test(filename)) {
    return true;
  } else if (/^app[-_]/i.test(filename)) {
    return true;
  } else if (/[-_]app\.py$/i.test(filename)) {
    return true;
  }

  return false;
}
