import * as path from "path";
import * as vscode from "vscode";
import { activateAssistant, deactivateAssistant } from "./assistant/extension";
import { handlePositShinyUri } from "./extension-onUri";
import { onDidStartDebugSession, pyDebugApp, pyRunApp, rRunApp } from "./run";
import {
  shinyliveCreateFromActiveEditor,
  shinyliveCreateFromExplorer,
  shinyliveSaveAppFromUrl,
} from "./shinylive";

export async function activate(context: vscode.ExtensionContext) {
  console.log("Activating Shiny extension");
  context.subscriptions.push(
    vscode.commands.registerCommand("shiny.python.runApp", pyRunApp),
    vscode.commands.registerCommand("shiny.python.debugApp", pyDebugApp),
    vscode.commands.registerCommand("shiny.r.runApp", rRunApp),
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
    })
  );

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
    editor.document.getText().search(/\bshiny\b/) >= 0;

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

/**
 * Determines whether a file is a Shiny application entry point based on its
 * filename.
 *
 * This function checks if a given filename follows the naming conventions for
 * Shiny application entry points in either Python or R. It validates against
 * several patterns:
 *
 * - Direct match: `app.py` or `app.R`
 * - Prefixed patterns: `app-*.py`, `app_*.py`, `app-*.R`, or `app_*.R`
 * - Suffixed patterns: `*-app.py`, `*_app.py`, `*-app.R`, or `*_app.R`
 * - For R files only: additional R-specific Shiny app patterns via
 *   `isShinyAppRPart`
 *
 * @param filename - The path or filename to check
 * @param language - The programming language, either "python" or "r"
 * @returns `true` if the filename matches a Shiny app pattern, `false`
 * otherwise
 */
export function isShinyAppFilename(
  filename: string,
  language: string
): boolean {
  filename = path.basename(filename);

  const extension = { python: "py", r: "R" }[language];

  // Only .py or .R files
  if (!new RegExp(`\\.${extension}$`, "i").test(filename)) {
    return false;
  }

  // Accepted patterns:
  // app.py|R
  const rxApp = new RegExp(`^app\\.${extension}$`, "i");
  // app-*.py|R
  // app_*.py|R
  const rxAppDash = new RegExp(`^app[-_].+\\.${extension}$`, "i");
  // *-app.py|R
  // *_app.py|R
  const rxDashApp = new RegExp(`[-_]app\\.${extension}$`, "i");

  if (rxApp.test(filename)) {
    return true;
  } else if (rxAppDash.test(filename)) {
    return true;
  } else if (rxDashApp.test(filename)) {
    return true;
  }

  if (language === "r") {
    return isShinyAppRPart(filename);
  }

  return false;
}

export function isShinyAppRPart(filename: string): boolean {
  filename = path.basename(filename);
  return ["ui.r", "server.r", "global.r"].includes(filename.toLowerCase());
}
