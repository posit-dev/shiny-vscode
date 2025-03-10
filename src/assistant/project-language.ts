import * as vscode from "vscode";
import { createPromiseWithStatus, type PromiseWithStatus } from "./utils";

/**
 * Counts the number of R and Python files in all workspace folders
 * @returns An object containing the count of .r/.R and .py files
 */
async function countLanguageFilesInWorkspace(): Promise<{
  r: number;
  python: number;
}> {
  const result = { r: 0, python: 0 };

  try {
    // Search for .r/.R and .py files in the workspace, up to 20 of each
    const rFiles = await vscode.workspace.findFiles("**/*.[rR]", undefined, 20);
    const pyFiles = await vscode.workspace.findFiles("**/*.py", undefined, 20);

    result.r = rFiles.length;
    result.python = pyFiles.length;
  } catch (error) {
    console.error("Error counting language files:", error);
  }

  return result;
}

export type ProjectLanguageGuess =
  | "definitely_r"
  | "definitely_python"
  | "probably_r"
  | "probably_python"
  | "unsure";

/**
 * Guess the likely project type based on the count of R and Python files.
 *
 * @param counts Object containing counts of R and Python files
 * @returns ProjectLanguage indicating whether the project is
 * definitely/probably R/Python or unsure
 * - "definitely_r": Only R files present
 * - "definitely_python": Only Python files present
 * - "probably_r": R files outnumber Python files by at least 3:1
 * - "probably_python": Python files outnumber R files by at least 3:1
 * - "unsure": No clear majority or no files found
 */
function guessProjectLanguage(counts: {
  r: number;
  python: number;
}): ProjectLanguageGuess {
  // If only one type exists, it's definitely that type
  if (counts.r > 0 && counts.python === 0) return "definitely_r";
  if (counts.python > 0 && counts.r === 0) return "definitely_python";

  // If neither exists, we're unsure
  if (counts.r === 0 && counts.python === 0) return "unsure";

  // Calculate ratio to determine "probably" cases
  const ratio = counts.r / counts.python;
  if (ratio >= 3) return "probably_r";
  if (ratio <= 1 / 3) return "probably_python";

  // If ratio is between 1/3 and 3, we're unsure
  return "unsure";
}

export async function guessWorkspaceLanguage(): Promise<ProjectLanguageGuess> {
  const counts = await countLanguageFilesInWorkspace();
  return guessProjectLanguage(counts);
}

/**
 * Checks if a valid Python environment is available
 * @returns Promise that resolves to true if a valid Python environment is
 * found, false otherwise
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
