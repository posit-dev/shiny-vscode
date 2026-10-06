import * as path from "path";
import * as vscode from "vscode";
import { activateAppDetection } from "./app-contexts";
import { activateAssistant, deactivateAssistant } from "./assistant/extension";
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

  activateAppDetection(context);

  vscode.debug.onDidStartDebugSession(onDidStartDebugSession);
}

// this method is called when your extension is deactivated
export function deactivate() {
  deactivateAssistant();
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
