import * as vscode from "vscode";
import { runApp } from "./run";

export const PYSHINY_EXEC_CMD = "PYSHINY_EXEC_CMD";
export const TERMINAL_NAME = "Shiny";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("shiny.python.runApp", runApp)
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(updateContext)
  );
  updateContext();
}

// this method is called when your extension is deactivated
export function deactivate() {}

function updateContext() {
  const editor = vscode.window.activeTextEditor;
  const active =
    editor &&
    editor.document.languageId === "python" &&
    !editor.document.isUntitled &&
    editor.document.fileName.match(/\/app\.py$/);
  vscode.commands.executeCommand("setContext", "shiny.python.active", active);
}
