import * as vscode from "vscode";

/**
 * Checks if a valid Python environment is available
 * @returns Promise that resolves to true if a valid Python environment is found, false otherwise
 */
export async function checkPythonEnvironment(): Promise<boolean> {
  // First check if Python extension is installed
  const pythonExtension = vscode.extensions.getExtension("ms-python.python");
  if (!pythonExtension) {
    const response = await vscode.window.showErrorMessage(
      "The Python extension is required. Please install it and try again.",
      "Show Python extension",
      "Not now"
    );

    if (response === "Show Python extension") {
      vscode.commands.executeCommand("extension.open", "ms-python.python");
    }
    return false;
  }

  // Then check if there's an active Python interpreter
  try {
    const pythonAPI = await pythonExtension.activate();
    const activeEnvPath = pythonAPI.environments.getActiveEnvironmentPath(
      vscode.window.activeTextEditor?.document.uri
    );
    const resolvedEnv =
      await pythonAPI.environments.resolveEnvironment(activeEnvPath);

    if (!resolvedEnv) {
      vscode.window.showErrorMessage(
        'No Python interpreter selected. Please use the "Python: Select Interpreter" command and try again.'
      );
      return false;
    }

    return true;
  } catch (error) {
    vscode.window.showErrorMessage(
      "Error checking Python environment: " +
        (error instanceof Error ? error.message : String(error))
    );
    return false;
  }
}

/**
 * Checks if the Shiny package is installed in the current Python environment
 * @returns Promise that resolves to true if Shiny is installed, false otherwise
 */
export async function checkShinyInstalled(): Promise<boolean> {
  const pythonExtension = vscode.extensions.getExtension("ms-python.python");
  if (!pythonExtension) {
    return false;
  }

  try {
    const pythonAPI = await pythonExtension.activate();
    const code =
      'import importlib.util; print(importlib.util.find_spec("shiny") is not None)';
    const result = await pythonAPI.environments.executeInTerminal(code);

    // The result will be 'True' if shiny is installed, 'False' if not
    return result?.trim().toLowerCase() === "true";
  } catch (error) {
    vscode.window.showErrorMessage(
      "Error checking Shiny installation: " +
        (error instanceof Error ? error.message : String(error))
    );
    return false;
  }
}
