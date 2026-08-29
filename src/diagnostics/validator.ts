import * as vscode from "vscode";
import { isShinyCode, validateShinyCode } from "./engine";
import { ShinyDiagnosticSeverity } from "./rules";

export { isShinyCode };

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
      raw.severity === ShinyDiagnosticSeverity.warning
        ? vscode.DiagnosticSeverity.Warning
        : vscode.DiagnosticSeverity.Error;
    const diag = new vscode.Diagnostic(range, raw.message, severity);
    diag.code = raw.code;
    diag.source = "shiny";
    return diag;
  });
}

export class ShinyDiagnosticsController implements vscode.Disposable {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private disposables: vscode.Disposable[] = [];
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection("shiny");
    this.disposables.push(this.diagnosticCollection);

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (this.getRunMode(event.document.languageId) === "onType") {
          this.debounceUpdate(event.document);
        }
      }),
      vscode.workspace.onDidSaveTextDocument((document) => {
        if (this.getRunMode(document.languageId) !== "off") {
          this.updateDiagnostics(document);
        }
      }),
      vscode.workspace.onDidOpenTextDocument((document) => {
        if (this.getRunMode(document.languageId) !== "off") {
          this.updateDiagnostics(document);
        }
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        this.clearDocument(document.uri);
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("shiny.diagnostics")) {
          this.refreshAll();
        }
      })
    );

    this.refreshAll();
  }

  public getRunMode(languageId: string): "onType" | "onSave" | "off" {
    if (languageId === "python") {
      return vscode.workspace
        .getConfiguration("shiny")
        .get<"onType" | "onSave" | "off">("diagnostics.python.run", "onType");
    }
    if (languageId === "r") {
      return vscode.workspace
        .getConfiguration("shiny")
        .get<"onType" | "onSave" | "off">("diagnostics.r.run", "onType");
    }
    return "off";
  }

  public isLanguageEnabled(languageId: string): boolean {
    if (languageId === "python") {
      return vscode.workspace
        .getConfiguration("shiny")
        .get<boolean>("diagnostics.python.enable", true);
    }
    if (languageId === "r") {
      return vscode.workspace
        .getConfiguration("shiny")
        .get<boolean>("diagnostics.r.enable", true);
    }
    return false;
  }

  public updateDiagnostics(document: vscode.TextDocument): void {
    if (!this.isLanguageEnabled(document.languageId)) {
      this.diagnosticCollection.delete(document.uri);
      return;
    }

    if (this.getRunMode(document.languageId) === "off") {
      this.diagnosticCollection.delete(document.uri);
      return;
    }

    const text = document.getText();
    if (!isShinyCode(text)) {
      this.diagnosticCollection.delete(document.uri);
      return;
    }

    const diags = validateShinyDocument(document);
    this.diagnosticCollection.set(document.uri, diags);
  }

  public refreshAll(): void {
    for (const doc of vscode.workspace.textDocuments) {
      if (
        this.isLanguageEnabled(doc.languageId) &&
        this.getRunMode(doc.languageId) !== "off"
      ) {
        this.updateDiagnostics(doc);
      } else {
        this.diagnosticCollection.delete(doc.uri);
      }
    }
  }

  private debounceUpdate(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    const existing = this.debounceTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      this.updateDiagnostics(document);
    }, 250);

    this.debounceTimers.set(key, timer);
  }

  private clearDocument(uri: vscode.Uri): void {
    const key = uri.toString();
    const timer = this.debounceTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(key);
    }
    this.diagnosticCollection.delete(uri);
  }

  public clear(): void {
    this.debounceTimers.forEach((timer) => clearTimeout(timer));
    this.debounceTimers.clear();
    this.diagnosticCollection.clear();
  }

  public dispose(): void {
    this.clear();
    this.disposables.forEach((d) => d.dispose());
  }
}
