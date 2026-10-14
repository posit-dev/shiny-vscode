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

  activateAppDetection(context, {
    workspace: vscode.workspace,
    setContext: (key, value) => {
      vscode.commands.executeCommand("setContext", key, value);
    },
  });

  vscode.debug.onDidStartDebugSession(onDidStartDebugSession);
}

// this method is called when your extension is deactivated
export function deactivate() {
  deactivateAssistant();
}
