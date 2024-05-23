import * as vscode from "vscode";

export async function activate(): Promise<void> {
  // If the Posit.shiny extension is installed, this old shell extension is no
  // longer needed.
  if (!vscode.extensions.getExtension("Posit.shiny")) {
    await vscode.commands.executeCommand(
      "workbench.extensions.installExtension",
      "Posit.shiny"
    );
  }

  vscode.commands.executeCommand(
    "workbench.extensions.uninstallExtension",
    "Posit.shiny-python"
  );
}
