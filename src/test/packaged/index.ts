import { PythonExtension } from "@vscode/python-extension";
import * as assert from "assert";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

// Runs only against the extracted VSIX, including its failure scenarios.
export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension("Posit.shiny");
  assert.ok(extension, "Packaged Shiny extension must be present");
  const hasPython = Boolean(
    vscode.extensions.getExtension("ms-python.python") &&
      process.env.SHINY_TEST_PYTHON
  );
  const selectedPython = Boolean(process.env.SHINY_TEST_SELECTED_PYTHON);
  if (selectedPython) {
    assert.ok(
      hasPython,
      "Selected-interpreter tests require ms-python.python and SHINY_TEST_PYTHON"
    );
  }
  if (hasPython) {
    await vscode.workspace
      .getConfiguration("python")
      .update(
        "defaultInterpreterPath",
        process.env.SHINY_TEST_PYTHON,
        vscode.ConfigurationTarget.Global
      );
    const api = await PythonExtension.api();
    const resource = vscode.workspace.workspaceFolders![0].uri;
    await api.environments.updateActiveEnvironmentPath(
      process.env.SHINY_TEST_PYTHON!,
      resource
    );
    const selected = await api.environments.resolveEnvironment(
      api.environments.getActiveEnvironmentPath(resource)
    );
    assert.strictEqual(
      selected?.path,
      process.env.SHINY_TEST_PYTHON,
      "The test must use the explicitly selected environment"
    );
  }
  await extension.activate();
  const commands = await vscode.commands.getCommands(true);
  for (const command of [
    "shiny.python.runApp",
    "shiny.python.debugApp",
    "shiny.r.runApp",
    "shiny.stopApp",
    "shiny.shinylive.createFromActiveEditor",
    "shiny.validateApp",
  ]) {
    assert.ok(commands.includes(command), `${command} must remain available`);
  }
  for (const language of ["python", "r"] as const) {
    const document = await vscode.workspace.openTextDocument({
      language,
      content:
        language === "python"
          ? "from shiny import render\n@render.text\ndef result():\n    return input.n\n"
          : "library(shiny)\ndata <- reactive({1})\nresult <- data\n",
    });
    await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand("shiny.validateApp");
    const diagnostics = vscode.languages
      .getDiagnostics(document.uri)
      .filter((diagnostic) => diagnostic.source === "shiny");
    const missing = process.env.SHINY_TEST_MISSING_PARSER;
    const hasBuiltinParser =
      !missing ||
      (language === "python" && missing.endsWith("tree-sitter-r.wasm"));
    if (!hasBuiltinParser && !(language === "python" && hasPython)) {
      assert.deepStrictEqual(
        diagnostics.map((issue) => [issue.code, issue.severity]),
        [["shiny.validationFailed", vscode.DiagnosticSeverity.Warning]]
      );
    } else {
      assert.strictEqual(diagnostics.length, 1);
      assert.strictEqual(
        diagnostics[0].code,
        language === "python" ? "UNCALLED_INPUT" : "shiny.uncalledReactive"
      );
    }
    await vscode.commands.executeCommand(
      "workbench.action.revertAndCloseActiveEditor"
    );
  }

  if (selectedPython) await testSelectedInterpreter(extension.extensionPath);
}

async function waitFor(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 15000;
  while (!check() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.ok(check(), "Problems did not reach the expected state");
}

async function testSelectedInterpreter(extensionPath: string): Promise<void> {
  const directory = fs.realpathSync(
    vscode.workspace.workspaceFolders![0].uri.fsPath
  );
  const filename = path.join(directory, "app.py");
  const worker = path.join(directory, "worker.py");
  const invalid =
    "from shiny import reactive\n@reactive.effect\ndef work():\n    print(input.n)\n";
  fs.writeFileSync(filename, "from shiny import ui\nimport worker\n");
  fs.writeFileSync(worker, invalid);
  let output: string;
  try {
    output = execFileSync(
      process.env.SHINY_TEST_PYTHON!,
      ["-m", "shiny", "validate", filename, "--json"],
      { encoding: "utf8", cwd: directory }
    );
  } catch (error) {
    const failure = error as { status?: number; stdout?: string };
    if (failure.status !== 1 || !failure.stdout) throw error;
    output = failure.stdout;
  }
  const cli = JSON.parse(output) as {
    errors: Array<{ file: string; line: number; code: string }>;
    warnings: unknown[];
  };
  assert.deepStrictEqual(
    cli.errors.map((issue) => [issue.file, issue.line, issue.code]),
    [[worker, 4, "UNCALLED_INPUT"]]
  );
  assert.deepStrictEqual(cli.warnings, []);
  const document = await vscode.workspace.openTextDocument(filename);
  await vscode.window.showTextDocument(document);
  await vscode.commands.executeCommand("shiny.validateApp");
  const workerDiagnostics = () =>
    vscode.languages
      .getDiagnostics(vscode.Uri.file(worker))
      .filter((issue) => issue.source === "shiny");
  await waitFor(() =>
    workerDiagnostics().some((issue) => issue.code === "UNCALLED_INPUT")
  );
  assert.deepStrictEqual(
    workerDiagnostics().map((issue) => [
      issue.code,
      issue.range.start.line,
      issue.severity,
    ]),
    [["UNCALLED_INPUT", 3, vscode.DiagnosticSeverity.Error]]
  );

  // Only the real controller publishes here; no injected validator can satisfy this.
  const child = await vscode.workspace.openTextDocument(worker);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    child.uri,
    new vscode.Range(0, 0, child.lineCount, 0),
    invalid.replace("input.n)", "input.n())")
  );
  assert.ok(await vscode.workspace.applyEdit(edit));
  await waitFor(() => workerDiagnostics().length === 0);
  assert.ok(child.isDirty);
  assert.strictEqual(
    fs.readFileSync(worker, "utf8"),
    invalid,
    "Validation must use the unsaved buffer without saving it"
  );

  await vscode.workspace
    .getConfiguration("shiny")
    .update("diagnostics.python.run", "off", vscode.ConfigurationTarget.Global);

  const restore = new vscode.WorkspaceEdit();
  restore.replace(
    child.uri,
    new vscode.Range(0, 0, child.lineCount, 0),
    invalid
  );
  assert.ok(await vscode.workspace.applyEdit(restore));
  await vscode.commands.executeCommand("shiny.validateApp");
  assert.strictEqual(workerDiagnostics()[0]?.code, "UNCALLED_INPUT");
  const helper = path.join(extensionPath, "python/validate.py");
  const original = fs.readFileSync(helper);
  try {
    fs.writeFileSync(
      helper,
      'raise RuntimeError("forced subprocess failure")\n'
    );
    await vscode.commands.executeCommand("shiny.validateApp");
    assert.strictEqual(
      workerDiagnostics()[0]?.code,
      "UNCALLED_INPUT",
      "A subprocess failure must preserve the previous report"
    );
    const failure = vscode.languages
      .getDiagnostics(document.uri)
      .find((issue) => issue.code === "shiny.validationFailed");
    assert.ok(failure, "A subprocess failure must be visible");
    assert.strictEqual(failure.severity, vscode.DiagnosticSeverity.Warning);
  } finally {
    fs.writeFileSync(helper, original);
  }
  await vscode.commands.executeCommand("shiny.validateApp");
  assert.ok(
    !vscode.languages
      .getDiagnostics(document.uri)
      .some((issue) => issue.code === "shiny.validationFailed"),
    "Successful recovery must clear the failure warning"
  );
  console.log(
    "Selected-interpreter parity: imported CLI error, unsaved fix, subprocess failure and recovery passed"
  );
}
