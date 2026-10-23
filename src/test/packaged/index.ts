import * as assert from "assert";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { validateWithPython } from "../../diagnostics/python";

// Runs only against the extracted VSIX, including its failure scenarios.
export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension("Posit.shiny");
  assert.ok(extension, "Packaged Shiny extension must be present");
  const hasPython = Boolean(
    vscode.extensions.getExtension("ms-python.python") &&
      process.env.SHINY_TEST_PYTHON
  );
  if (hasPython) {
    await vscode.workspace
      .getConfiguration("python")
      .update(
        "defaultInterpreterPath",
        process.env.SHINY_TEST_PYTHON,
        vscode.ConfigurationTarget.Global
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
      assert.deepStrictEqual(diagnostics, []);
    } else {
      assert.strictEqual(diagnostics.length, 1);
      assert.strictEqual(
        diagnostics[0].code,
        language === "python" ? "UNCALLED_INPUT" : "shiny.uncalledReactive"
      );
    }
    if (language === "python" && process.env.SHINY_TEST_PYTHON) {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), "shiny-packaged-python-")
      );
      try {
        const filename = path.join(directory, "app.py");
        const report = await validateWithPython(
          process.env.SHINY_TEST_PYTHON,
          path.join(extension.extensionPath, "python/validate.py"),
          {
            path: filename,
            sources: { [filename]: document.getText() },
          }
        );
        assert.ok(
          report?.available,
          "Packaged Python helper must load the shared validator"
        );
        assert.deepStrictEqual(
          report.diagnostics.map((issue) => issue.code),
          ["UNCALLED_INPUT"]
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
    await vscode.commands.executeCommand(
      "workbench.action.revertAndCloseActiveEditor"
    );
  }

  // Optional end-to-end comparison with a real selected Python interpreter.
  if (process.env.SHINY_TEST_APP && process.env.SHINY_TEST_PYTHON) {
    assert.ok(
      hasPython,
      "The Python extension is required for interpreter-selection testing"
    );
    const filename = process.env.SHINY_TEST_APP;
    let output: string;
    try {
      output = execFileSync(
        process.env.SHINY_TEST_PYTHON,
        ["-m", "shiny", "validate", filename, "--json"],
        { encoding: "utf8", cwd: path.dirname(filename) }
      );
    } catch (error) {
      const failure = error as { status?: number; stdout?: string };
      if (failure.status !== 1 || !failure.stdout) throw error;
      output = failure.stdout;
    }
    const cli = JSON.parse(output) as {
      errors: Array<{ file: string; line: number; code: string }>;
      warnings: Array<{ file: string; line: number; code: string }>;
    };
    const expected = [
      ...cli.errors.map((issue) => [
        issue.file,
        issue.line,
        issue.code,
        vscode.DiagnosticSeverity.Error,
      ]),
      ...cli.warnings.map((issue) => [
        issue.file,
        issue.line,
        issue.code,
        vscode.DiagnosticSeverity.Warning,
      ]),
    ]
      .map((issue) => JSON.stringify(issue))
      .sort();
    const document = await vscode.workspace.openTextDocument(filename);
    await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand("shiny.validateApp");
    const actual = vscode.languages
      .getDiagnostics()
      .flatMap(([uri, diagnostics]) =>
        diagnostics
          .filter(
            (diagnostic) =>
              diagnostic.source === "shiny" &&
              uri.fsPath.startsWith(path.dirname(filename) + path.sep)
          )
          .map((diagnostic) =>
            JSON.stringify([
              uri.fsPath,
              diagnostic.range.start.line + 1,
              diagnostic.code,
              diagnostic.severity,
            ])
          )
      )
      .sort();
    assert.deepStrictEqual(actual, expected);
    console.log(
      `Selected-interpreter parity: ${cli.errors.length} errors, ${cli.warnings.length} warnings`
    );
  }
}
