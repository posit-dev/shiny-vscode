import { PythonExtension } from "@vscode/python-extension";
import * as path from "path";
import * as vscode from "vscode";
import { isShinyCode, validateShinyCode } from "./engine";
import {
  documentPath,
  type PythonDocumentValidator,
  validatePythonDocument,
} from "./python-document";
import { ShinyDiagnosticSeverity } from "./rules";

interface DocumentReport {
  document: vscode.TextDocument;
  files: Set<string>;
  diagnostics: Map<string, [vscode.Uri, vscode.Diagnostic[]]>;
}

export { isShinyCode } from "../shiny-detection";

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
  private reports = new Map<string, DocumentReport>();
  private failures = new Map<string, [vscode.Uri, vscode.Diagnostic[]]>();
  private dependencyWatchers = new Map<string, vscode.FileSystemWatcher>();
  private requests = new Map<
    string,
    { document: vscode.TextDocument; controller: AbortController }
  >();
  private disposed = false;

  constructor(
    private readonly pythonValidator: PythonDocumentValidator = validatePythonDocument
  ) {
    this.diagnosticCollection =
      vscode.languages.createDiagnosticCollection("shiny");
    this.disposables.push(this.diagnosticCollection);

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (!event.contentChanges.length) return;
        for (const document of this.affectedDocuments(event.document)) {
          if (this.getRunMode(document.languageId) === "onType") {
            this.debounceUpdate(document);
          }
        }
      }),
      vscode.workspace.onDidSaveTextDocument((document) => {
        for (const target of this.affectedDocuments(document)) {
          if (this.getRunMode(target.languageId) !== "off") {
            void this.updateDiagnostics(target);
          }
        }
      }),
      vscode.workspace.onDidOpenTextDocument((document) => {
        if (this.getRunMode(document.languageId) === "onType") {
          void this.updateDiagnostics(document);
        }
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        const parents = this.affectedDocuments(document).filter(
          (target) => target !== document
        );
        this.clearDocument(document.uri);
        for (const parent of parents) {
          if (this.getRunMode(parent.languageId) === "onType") {
            this.debounceUpdate(parent);
          }
        }
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration("shiny.diagnostics") ||
          event.affectsConfiguration("python")
        ) {
          this.refreshAll();
        }
      }),
      vscode.workspace.onDidGrantWorkspaceTrust(() => this.refreshAll())
    );

    if (vscode.extensions.getExtension("ms-python.python")) {
      void PythonExtension.api()
        .then((api) => {
          if (!this.disposed) {
            this.disposables.push(
              api.environments.onDidChangeActiveEnvironmentPath(() =>
                this.refreshAll()
              )
            );
          }
        })
        .catch((error) =>
          console.warn("Could not watch the Python environment:", error)
        );
    }

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

  public async updateDiagnostics(document: vscode.TextDocument): Promise<void> {
    if (
      !this.isLanguageEnabled(document.languageId) ||
      this.getRunMode(document.languageId) === "off"
    ) {
      this.clearDocument(document.uri);
      return;
    }
    // Avoid starting Python for unrelated open files. Imported files are
    // analyzed by their app entry point even when they don't import Shiny.
    if (
      document.languageId === "python" &&
      path.basename(document.fileName) !== "app.py"
    ) {
      try {
        if (!isShinyCode(document.getText(), "python")) {
          this.clearDocument(document.uri);
          return;
        }
      } catch {
        // A missing bundled parser must not disable the Python validator.
      }
    }
    await this.validateDocument(document, false);
  }

  public async validateDocument(
    document: vscode.TextDocument,
    manual = true
  ): Promise<vscode.Diagnostic[]> {
    const key = document.uri.toString();
    clearTimeout(this.debounceTimers.get(key));
    this.debounceTimers.delete(key);
    this.requests.get(key)?.controller.abort();
    const controller = new AbortController();
    this.requests.set(key, { document, controller });
    const version = document.version;
    try {
      const python =
        document.languageId === "python"
          ? await this.pythonValidator(document, controller.signal)
          : undefined;
      if (
        this.disposed ||
        controller.signal.aborted ||
        document.isClosed ||
        document.version !== version
      ) {
        return [];
      }
      const report: DocumentReport = {
        document,
        files: new Set(python?.files ?? [documentPath(document)]),
        diagnostics: new Map(),
      };
      if (python) {
        for (const issue of python.diagnostics) {
          const uri =
            issue.file === python.entry
              ? document.uri
              : (vscode.workspace.textDocuments.find(
                  (source) =>
                    source.uri.scheme === "file" &&
                    documentPath(source) === issue.file
                )?.uri ?? vscode.Uri.file(issue.file));
          const start =
            issue.sourceLine.length - issue.sourceLine.trimStart().length;
          const range = new vscode.Range(
            issue.line - 1,
            start,
            issue.line - 1,
            Math.max(start + 1, issue.sourceLine.length)
          );
          const diagnostic = new vscode.Diagnostic(
            range,
            issue.message,
            issue.severity === "error"
              ? vscode.DiagnosticSeverity.Error
              : vscode.DiagnosticSeverity.Warning
          );
          diagnostic.source = "shiny";
          diagnostic.code = issue.code;
          const file = report.diagnostics.get(uri.toString()) ?? [uri, []];
          file[1].push(diagnostic);
          report.diagnostics.set(uri.toString(), file);
        }
      } else {
        report.diagnostics.set(key, [
          document.uri,
          validateShinyDocument(document),
        ]);
        if (manual && document.languageId === "python") {
          void vscode.window.showInformationMessage(
            "Using limited built-in Shiny checks. Full Python diagnostics require a trusted workspace and a selected Python environment that provides shiny.validate."
          );
        }
      }
      this.reports.set(key, report);
      this.failures.delete(key);
      this.publish();
      return [...report.diagnostics.values()].flatMap(
        ([, diagnostics]) => diagnostics
      );
    } catch (error) {
      if (!controller.signal.aborted && !this.disposed) {
        const failure = new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 1),
          `Shiny validation failed. Previous results may be out of date. ${error instanceof Error ? error.message : String(error)}`,
          vscode.DiagnosticSeverity.Warning
        );
        failure.source = "shiny";
        failure.code = "shiny.validationFailed";
        this.failures.set(key, [document.uri, [failure]]);
        this.publish();
        console.warn("Shiny validation failed:", error);
        if (manual) {
          void vscode.window.showWarningMessage(
            `Shiny validation failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
      return [];
    } finally {
      if (this.requests.get(key)?.controller === controller) {
        this.requests.delete(key);
      }
    }
  }

  private affectedDocuments(
    document: vscode.TextDocument
  ): vscode.TextDocument[] {
    const filename = documentPath(document);
    const documents = new Map<string, vscode.TextDocument>();
    for (const [key, report] of this.reports) {
      if (report.files.has(filename)) documents.set(key, report.document);
    }
    for (const [key, request] of this.requests) {
      const relative = path.relative(
        path.dirname(documentPath(request.document)),
        filename
      );
      if (
        !relative.startsWith(`..${path.sep}`) &&
        relative !== ".." &&
        !path.isAbsolute(relative)
      ) {
        documents.set(key, request.document);
      }
    }
    if (!documents.size) documents.set(document.uri.toString(), document);
    return [...documents.values()].filter((target) => !target.isClosed);
  }

  private publish(): void {
    const files = new Map<string, [vscode.Uri, vscode.Diagnostic[]]>();
    const reports = [...this.reports.values()].map(
      (report) => report.diagnostics
    );
    for (const diagnosticsByFile of [...reports, this.failures]) {
      for (const [key, [uri, diagnostics]] of diagnosticsByFile) {
        const file = files.get(key) ?? [uri, []];
        for (const diagnostic of diagnostics) {
          if (
            !file[1].some(
              (existing) =>
                existing.code === diagnostic.code &&
                existing.message === diagnostic.message &&
                existing.range.isEqual(diagnostic.range)
            )
          ) {
            file[1].push(diagnostic);
          }
        }
        files.set(key, file);
      }
    }
    this.diagnosticCollection.forEach((uri) => {
      if (!files.has(uri.toString())) this.diagnosticCollection.delete(uri);
    });
    this.diagnosticCollection.set([...files.values()]);
    this.watchDependencies();
  }

  private watchDependencies(): void {
    const dependencies = new Set<string>();
    for (const report of this.reports.values()) {
      for (const filename of report.files) {
        if (filename !== documentPath(report.document)) {
          dependencies.add(filename);
        }
      }
    }
    for (const [filename, watcher] of this.dependencyWatchers) {
      if (!dependencies.has(filename)) {
        watcher.dispose();
        this.dependencyWatchers.delete(filename);
      }
    }
    for (const filename of dependencies) {
      if (this.dependencyWatchers.has(filename)) continue;
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(
          path.dirname(filename),
          path.basename(filename)
        )
      );
      const refresh = () => {
        // Unsaved buffers remain authoritative over external disk edits.
        if (
          vscode.workspace.textDocuments.some(
            (source) => source.isDirty && documentPath(source) === filename
          )
        ) {
          return;
        }
        for (const report of this.reports.values()) {
          if (
            report.files.has(filename) &&
            !report.document.isClosed &&
            this.getRunMode(report.document.languageId) !== "off"
          ) {
            this.debounceUpdate(report.document, true);
          }
        }
      };
      watcher.onDidChange(refresh);
      watcher.onDidCreate(refresh);
      watcher.onDidDelete(refresh);
      this.dependencyWatchers.set(filename, watcher);
    }
  }

  public refreshAll(): void {
    this.clear();
    for (const document of vscode.workspace.textDocuments) {
      if (
        this.isLanguageEnabled(document.languageId) &&
        this.getRunMode(document.languageId) === "onType"
      ) {
        void this.updateDiagnostics(document);
      }
    }
  }

  private debounceUpdate(
    document: vscode.TextDocument,
    diskChange = false
  ): void {
    const key = document.uri.toString();
    this.requests.get(key)?.controller.abort();
    clearTimeout(this.debounceTimers.get(key));
    this.debounceTimers.set(
      key,
      setTimeout(
        () => {
          this.debounceTimers.delete(key);
          if (
            this.getRunMode(document.languageId) === "onType" ||
            (diskChange && this.getRunMode(document.languageId) === "onSave")
          ) {
            void this.updateDiagnostics(document);
          }
        },
        document.languageId === "python" ? 750 : 250
      )
    );
  }

  private clearDocument(uri: vscode.Uri): void {
    const key = uri.toString();
    clearTimeout(this.debounceTimers.get(key));
    this.debounceTimers.delete(key);
    this.requests.get(key)?.controller.abort();
    this.requests.delete(key);
    this.reports.delete(key);
    this.failures.delete(key);
    this.publish();
  }

  public clear(): void {
    this.debounceTimers.forEach((timer) => clearTimeout(timer));
    this.debounceTimers.clear();
    this.requests.forEach(({ controller }) => controller.abort());
    this.requests.clear();
    this.reports.clear();
    this.failures.clear();
    this.dependencyWatchers.forEach((watcher) => watcher.dispose());
    this.dependencyWatchers.clear();
    this.diagnosticCollection.clear();
  }

  public dispose(): void {
    this.disposed = true;
    this.clear();
    this.disposables.forEach((d) => d.dispose());
  }
}
