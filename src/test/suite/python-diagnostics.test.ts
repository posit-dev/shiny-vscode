import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { initializeParsers } from "../../diagnostics/parser";
import type { PythonReport } from "../../diagnostics/python";
import { pythonValidationRequest } from "../../diagnostics/python-document";
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
      fs.mkdtempSync(
        path.join(
          vscode.workspace.workspaceFolders![0].uri.fsPath,
          "shiny-async-"
        )
      )
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

  test("Subprocess input excludes unrelated Python buffers", async () => {
    const child = await vscode.workspace.openTextDocument(imported);
    const unrelated = path.join(directory + "-other", "private.py");
    fs.mkdirSync(path.dirname(unrelated));
    fs.writeFileSync(unrelated, "secret = 1\n");
    const other = await vscode.workspace.openTextDocument(unrelated);
    try {
      const edit = new vscode.WorkspaceEdit();
      edit.insert(
        other.uri,
        new vscode.Position(0, 0),
        "# unrelated unsaved source\n"
      );
      assert.ok(await vscode.workspace.applyEdit(edit));
      const request = pythonValidationRequest(document);
      assert.strictEqual(
        request.sources[document.uri.fsPath],
        document.getText()
      );
      assert.strictEqual(request.sources[imported.fsPath], child.getText());
      assert.ok(
        !Object.hasOwn(request.sources, unrelated),
        "Unrelated unsaved source must not reach the interpreter"
      );
    } finally {
      await vscode.window.showTextDocument(other);
      await vscode.commands.executeCommand(
        "workbench.action.revertAndCloseActiveEditor"
      );
      fs.rmSync(path.dirname(unrelated), { recursive: true, force: true });
    }
  });

  test("Python typing bursts coalesce into one scan", async () => {
    let scans = 0;
    controller = new ShinyDiagnosticsController(async (entry) => {
      if (entry === document) scans++;
      return {
        available: true,
        entry: entry.uri.fsPath,
        files: [entry.uri.fsPath],
        diagnostics: entry === document ? report("COALESCED").diagnostics : [],
      };
    });
    await configuration.update(
      "diagnostics.python.run",
      "onType",
      vscode.ConfigurationTarget.Workspace
    );
    await waitFor(() =>
      diagnostics().some((issue) => issue.code === "COALESCED")
    );
    scans = 0;
    for (let i = 0; i < 3; i++) {
      const edit = new vscode.WorkspaceEdit();
      edit.insert(document.uri, new vscode.Position(0, 0), "# typing\n");
      assert.ok(await vscode.workspace.applyEdit(edit));
      if (i < 2) await new Promise((resolve) => setTimeout(resolve, 300));
    }
    await waitFor(() => scans > 0);
    assert.strictEqual(
      scans,
      1,
      "Brief pauses while typing must not start repeated Python scans"
    );
  });

  test("A failed scan preserves previous results until recovery", async () => {
    let failing = false;
    let resolved = false;
    controller = new ShinyDiagnosticsController(async () => {
      if (failing) throw new Error("Interpreter stopped");
      return {
        ...report("EXISTING_ERROR"),
        diagnostics: resolved ? [] : report("EXISTING_ERROR").diagnostics,
      };
    });
    await controller.validateDocument(document, false);
    failing = true;
    await controller.validateDocument(document, false);
    assert.deepStrictEqual(
      diagnostics().map((issue) => issue.code),
      ["EXISTING_ERROR"]
    );
    const failure = vscode.languages
      .getDiagnostics(document.uri)
      .find((issue) => issue.code === "shiny.validationFailed");
    assert.ok(failure, "Automatic failures must be visible in Problems");
    assert.strictEqual(failure.severity, vscode.DiagnosticSeverity.Warning);
    failing = false;
    resolved = true;
    await controller.validateDocument(document, false);
    assert.deepStrictEqual(diagnostics(), []);
    assert.ok(
      !vscode.languages
        .getDiagnostics(document.uri)
        .some((issue) => issue.code === "shiny.validationFailed")
    );
  });

  test("Manual validation consumes a pending typing scan", async () => {
    let slow = false;
    controller = new ShinyDiagnosticsController(async (entry) => {
      if (entry === document && slow) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      return {
        available: true,
        entry: entry.uri.fsPath,
        files: [entry.uri.fsPath],
        diagnostics:
          entry === document ? report("MANUAL_RESULT").diagnostics : [],
      };
    });
    await configuration.update(
      "diagnostics.python.run",
      "onType",
      vscode.ConfigurationTarget.Workspace
    );
    await waitFor(() =>
      diagnostics().some((issue) => issue.code === "MANUAL_RESULT")
    );
    const edit = new vscode.WorkspaceEdit();
    edit.insert(
      document.uri,
      new vscode.Position(0, 0),
      "# typing before command\n"
    );
    assert.ok(await vscode.workspace.applyEdit(edit));
    slow = true;
    const result = await controller.validateDocument(document);
    assert.deepStrictEqual(
      result.map((issue) => issue.code),
      ["MANUAL_RESULT"],
      "The old typing timer must not cancel a manual scan that is still running"
    );
  });

  test("A closed imported file changed on disk refreshes its app", async () => {
    controller = new ShinyDiagnosticsController(async () => ({
      ...report("DISK_ERROR"),
      diagnostics: fs.readFileSync(imported.fsPath, "utf8").includes("fixed")
        ? []
        : report("DISK_ERROR").diagnostics,
    }));
    await configuration.update(
      "diagnostics.python.run",
      "onSave",
      vscode.ConfigurationTarget.Workspace
    );
    await controller.validateDocument(document, false);
    assert.deepStrictEqual(
      diagnostics().map((issue) => issue.code),
      ["DISK_ERROR"]
    );
    assert.ok(
      !vscode.workspace.textDocuments.some(
        (source) =>
          source.uri.toString() === imported.toString() && !source.isClosed
      )
    );
    fs.writeFileSync(imported.fsPath, "# fixed\n");
    await waitFor(() => diagnostics().length === 0);
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
