import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { getSelectedPythonInterpreter } from "../run";
import {
  type PythonReport,
  type PythonValidationRequest,
  validateWithPython,
} from "./python";

export type PythonDocumentValidator = (
  document: vscode.TextDocument,
  signal: AbortSignal
) => Promise<PythonReport | undefined>;

export function documentPath(document: vscode.TextDocument): string {
  const filename =
    document.uri.scheme === "file"
      ? document.uri.fsPath
      : path.join(
          vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.tmpdir(),
          path.basename(document.fileName)
        );
  try {
    return fs.realpathSync(filename);
  } catch {
    return path.resolve(filename);
  }
}

export function pythonValidationRequest(
  document: vscode.TextDocument
): PythonValidationRequest {
  const filename = documentPath(document);
  const sources: Record<string, string> = {};
  for (const source of vscode.workspace.textDocuments) {
    const relative = path.relative(
      path.dirname(filename),
      documentPath(source)
    );
    if (
      source.languageId === "python" &&
      (source.uri.scheme === "file" || source === document) &&
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative)
    ) {
      sources[documentPath(source)] = source.getText();
    }
  }
  return { path: filename, sources };
}

// Bound interpreter startups when several Shiny documents are opened together.
let pending: Promise<unknown> = Promise.resolve();

export const validatePythonDocument: PythonDocumentValidator = async (
  document,
  signal
) => {
  if (
    !vscode.workspace.isTrusted ||
    !vscode.extensions.getExtension("ms-python.python")
  ) {
    return undefined;
  }
  const interpreter = await getSelectedPythonInterpreter(document.uri, true);
  if (!interpreter) return undefined;
  const extension = vscode.extensions.getExtension("Posit.shiny");
  if (!extension) return undefined;
  const request = pythonValidationRequest(document);
  const task = pending.then(() => {
    if (signal.aborted) throw signal.reason;
    return validateWithPython(
      interpreter,
      path.join(extension.extensionPath, "python/validate.py"),
      request,
      signal
    );
  });
  pending = task.catch(() => {});
  return task;
};
