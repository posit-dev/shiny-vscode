import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { initializeParsers } from "../../diagnostics/parser";
import type { PythonReport } from "../../diagnostics/python";
import { ShinyDiagnosticsController } from "../../diagnostics/validator";

async function waitFor(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 3000;
  while (!check() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(check(), "Diagnostics did not reach the expected state");
}

suite("Asynchronous Python diagnostics", function () {
  this.timeout(10000);
  suiteSetup(() => initializeParsers(path.resolve(__dirname, "../../parsers")));
  let directory: string;
  let document: vscode.TextDocument;
  let imported: vscode.Uri;
  let previous: unknown;
  let controller: ShinyDiagnosticsController | undefined;
  const configuration = vscode.workspace.getConfiguration("shiny");
  const diagnostics = () =>
    vscode.languages
      .getDiagnostics(imported)
      .filter((diagnostic) => diagnostic.source === "shiny");
  const report = (code: string): PythonReport => ({
    available: true,
    entry: document.uri.fsPath,
    files: [document.uri.fsPath, imported.fsPath],
    diagnostics: [
      {
        file: imported.fsPath,
        line: 1,
        code,
        message: code,
        severity: "warning",
        sourceLine: "input.n",
      },
    ],
  });

  setup(async () => {
    previous = configuration.inspect("diagnostics.python.run")?.workspaceValue;
    await configuration.update(
      "diagnostics.python.run",
      "off",
      vscode.ConfigurationTarget.Workspace
    );
    directory = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "shiny-async-"))
    );
    const filename = path.join(directory, "app.py");
    fs.writeFileSync(filename, "from shiny import ui\nimport worker\n");
    imported = vscode.Uri.file(path.join(directory, "worker.py"));
    fs.writeFileSync(imported.fsPath, "from shiny import ui\n");
    document = await vscode.workspace.openTextDocument(filename);
  });
  teardown(async () => {
    controller?.dispose();
    controller = undefined;
    await configuration.update(
      "diagnostics.python.run",
      previous,
      vscode.ConfigurationTarget.Workspace
    );
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test("A superseded scan cannot replace newer diagnostics", async () => {
    let release: (report: PythonReport) => void = () =>
      assert.fail("First scan did not start");
    let first = true;
    controller = new ShinyDiagnosticsController(async () => {
      if (first) {
        first = false;
        return new Promise((resolve) => {
          release = resolve;
        });
      }
      return report("NEW_RESULT");
    });
    const pending = controller.validateDocument(document);
    await controller.validateDocument(document);
    release(report("STALE_RESULT"));
    await pending;
    assert.deepStrictEqual(
      diagnostics().map((diagnostic) => diagnostic.code),
      ["NEW_RESULT"]
    );
  });

  test("Closing an entry point cancels its pending imported-file diagnostics", async () => {
    let release: (report: PythonReport) => void = () =>
      assert.fail("Scan did not start");
    controller = new ShinyDiagnosticsController(
      async () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const untitled = await vscode.workspace.openTextDocument({
      language: "python",
      content: "from shiny import ui\n",
    });
    await vscode.window.showTextDocument(untitled);
    const pending = controller.validateDocument(untitled);
    await vscode.commands.executeCommand(
      "workbench.action.revertAndCloseActiveEditor"
    );
    await waitFor(() => untitled.isClosed);
    release(report("STALE_RESULT"));
    await pending;
    assert.deepStrictEqual(diagnostics(), []);
  });

  test("Edits in imported files refresh the app's diagnostics", async () => {
    const child = await vscode.workspace.openTextDocument(imported);
    controller = new ShinyDiagnosticsController(async (entry) => {
      if (entry !== document) {
        return {
          available: true,
          entry: entry.uri.fsPath,
          files: [entry.uri.fsPath],
          diagnostics: [],
        };
      }
      return {
        ...report("IMPORTED_ERROR"),
        diagnostics: child.getText().includes("fixed")
          ? []
          : report("IMPORTED_ERROR").diagnostics,
      };
    });
    await configuration.update(
      "diagnostics.python.run",
      "onType",
      vscode.ConfigurationTarget.Workspace
    );
    await waitFor(() => diagnostics().length === 1);
    const edit = new vscode.WorkspaceEdit();
    edit.insert(imported, new vscode.Position(0, 0), "# fixed\n");
    assert.ok(await vscode.workspace.applyEdit(edit));
    await waitFor(() => diagnostics().length === 0);
    await vscode.window.showTextDocument(child);
    await vscode.commands.executeCommand(
      "workbench.action.revertAndCloseActiveEditor"
    );
  });

  test("Removing Shiny code clears a module's previous diagnostics", async () => {
    const child = await vscode.workspace.openTextDocument(imported);
    controller = new ShinyDiagnosticsController(async (entry) => ({
      available: true,
      entry: entry.uri.fsPath,
      files: [entry.uri.fsPath],
      diagnostics: entry === child ? report("OUTDATED").diagnostics : [],
    }));
    await configuration.update(
      "diagnostics.python.run",
      "onType",
      vscode.ConfigurationTarget.Workspace
    );
    await waitFor(() =>
      diagnostics().some((diagnostic) => diagnostic.code === "OUTDATED")
    );
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      imported,
      new vscode.Range(0, 0, child.lineCount, 0),
      "x = 1\n"
    );
    assert.ok(await vscode.workspace.applyEdit(edit));
    await waitFor(() => diagnostics().length === 0);
    await vscode.window.showTextDocument(child);
    await vscode.commands.executeCommand(
      "workbench.action.revertAndCloseActiveEditor"
    );
  });
});
