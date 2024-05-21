import * as vscode from "vscode";

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  // This shell `Posit.shiny-python` extension depends on the new `Posit.shiny`
  // extension. In the unlikely event the new extension is not installed, this
  // check will prompt the user to install it. The new extension handles
  // uninstallation or deactivation of the `Posit.shiny-python` extension.
  if (vscode.extensions.getExtension("Posit.shiny")) {
    return;
  }

  const response = await vscode.window.showInformationMessage(
    "This extension has been deprecated. Please install the new extension 'Shiny' by Posit.",
    "Install now",
    "Show extension"
  );

  switch (response) {
    case "Install now":
      vscode.commands.executeCommand(
        "workbench.extensions.installExtension",
        "Posit.shiny"
      );
      break;

    case "Show extension":
      vscode.commands.executeCommand(
        "workbench.extensions.search",
        "Posit.shiny"
      );
      break;

    default:
      break;
  }
}
