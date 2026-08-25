import * as vscode from "vscode";
import { validateShinyCode } from "./engine";
import { ShinyDiagnosticSeverity } from "./rules";

export function validateShinyDocument(
  document: vscode.TextDocument
): vscode.Diagnostic[] {
  const text = document.getText();
  const languageId = document.languageId;
  if (languageId !== "python" && languageId !== "r") {
    return [];
  }

  const rawDiags = validateShinyCode(text, languageId);
  return rawDiags.map((raw) => {
    const range = new vscode.Range(
      raw.range.startLine,
      raw.range.startChar,
      raw.range.endLine,
      raw.range.endChar
    );
    const severity =
      raw.severity === ShinyDiagnosticSeverity.error
        ? vscode.DiagnosticSeverity.Error
        : vscode.DiagnosticSeverity.Warning;
    const diag = new vscode.Diagnostic(range, raw.message, severity);
    diag.code = raw.code;
    diag.source = "shiny";
    return diag;
  });
}

export class ShinyDiagnosticsController implements vscode.Disposable {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection("shiny");
    this.disposables.push(this.diagnosticCollection);

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        this.updateDiagnostics(event.document);
      }),
      vscode.workspace.onDidOpenTextDocument((document) => {
        this.updateDiagnostics(document);
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        this.diagnosticCollection.delete(document.uri);
      })
    );

    if (vscode.window.activeTextEditor) {
      this.updateDiagnostics(vscode.window.activeTextEditor.document);
    }
  }

  public updateDiagnostics(document: vscode.TextDocument): void {
    if (
      document.languageId !== "python" &&
      document.languageId !== "r"
    ) {
      return;
    }

    const text = document.getText();
    if (!text.includes("shiny") && !text.includes("reactive") && !text.includes("render")) {
      this.diagnosticCollection.delete(document.uri);
      return;
    }

    const diags = validateShinyDocument(document);
    this.diagnosticCollection.set(document.uri, diags);
  }

  public clear(): void {
    this.diagnosticCollection.clear();
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
