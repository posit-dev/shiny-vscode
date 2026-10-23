import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import type { PythonIssue } from "../../diagnostics/python";
import { ShinyDiagnosticsController } from "../../diagnostics/validator";

async function waitFor(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!check() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(check(), "Expected diagnostic was not published");
}

suite("Shiny diagnostics integration", function () {
  this.timeout(10000);
  test("Warning-only manual results do not show an error notification", async () => {
    await vscode.extensions.getExtension("Posit.shiny")!.activate();
    const original = Object.getOwnPropertyDescriptor(
      vscode.window,
      "showErrorMessage"
    )!;
    const errors: string[] = [];
    Object.defineProperty(vscode.window, "showErrorMessage", {
      configurable: true,
      value: async (message: string) => {
        errors.push(message);
      },
    });
    try {
      const document = await vscode.workspace.openTextDocument({
        language: "r",
        content:
          'library(shiny)\nui <- fluidPage(textOutput("present"))\noutput$missing <- renderText("ok")\n',
      });
      await vscode.window.showTextDocument(document);
      await vscode.commands.executeCommand("shiny.validateApp");
      const diagnostics = vscode.languages
        .getDiagnostics(document.uri)
        .filter((issue) => issue.source === "shiny");
      assert.strictEqual(diagnostics[0]?.code, "shiny.idMismatch");
      assert.strictEqual(
        diagnostics[0].severity,
        vscode.DiagnosticSeverity.Warning
      );
      assert.deepStrictEqual(errors, []);
    } finally {
      Object.defineProperty(vscode.window, "showErrorMessage", original);
      await vscode.commands.executeCommand(
        "workbench.action.revertAndCloseActiveEditor"
      );
    }
  });
  test("Python reports publish in imported files and clear after resolution", async () => {
    const configuration = vscode.workspace.getConfiguration("shiny");
    const previous = configuration.inspect(
      "diagnostics.python.run"
    )?.workspaceValue;
    const directory = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "shiny-report-"))
    );
    const filename = path.join(directory, "app.py");
    const imported = path.join(directory, "worker.py");
    fs.writeFileSync(filename, "from shiny import ui\nimport worker\n");
    fs.writeFileSync(imported, "from shiny import reactive\n");
    let controller: ShinyDiagnosticsController | undefined;
    try {
      await configuration.update(
        "diagnostics.python.run",
        "off",
        vscode.ConfigurationTarget.Workspace
      );
      const document = await vscode.workspace.openTextDocument(filename);
      let issues: PythonIssue[] = [
        {
          file: imported,
          line: 3,
          code: "EXTENDED_TASK_REACTIVE_READ",
          message: "Read inputs before invoking the task",
          severity: "error",
          sourceLine: "    return input.n()",
        },
      ];
      controller = new ShinyDiagnosticsController(async () => ({
        available: true,
        entry: filename,
        files: [filename, imported],
        diagnostics: issues,
      }));
      assert.strictEqual(
        (await controller.validateDocument(document)).length,
        1
      );
      let diagnostics = vscode.languages.getDiagnostics(
        vscode.Uri.file(imported)
      );
      assert.strictEqual(diagnostics[0].code, "EXTENDED_TASK_REACTIVE_READ");
      assert.strictEqual(diagnostics[0].range.start.line, 2);
      assert.strictEqual(diagnostics[0].range.start.character, 4);
      issues = [];
      await controller.validateDocument(document);
      diagnostics = vscode.languages.getDiagnostics(vscode.Uri.file(imported));
      assert.deepStrictEqual(diagnostics, []);
    } finally {
      controller?.dispose();
      await configuration.update(
        "diagnostics.python.run",
        previous,
        vscode.ConfigurationTarget.Workspace
      );
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  for (const language of ["python", "r"] as const) {
    test(`${language} onSave waits for a save on open, refresh, and edit`, async () => {
      const extension = vscode.extensions.getExtension("Posit.shiny");
      assert.ok(extension);
      await extension.activate();
      const configuration = vscode.workspace.getConfiguration("shiny");
      const key = `diagnostics.${language}.run`;
      const previous = configuration.inspect(key)?.workspaceValue;
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "shiny-save-"));
      try {
        await configuration.update(
          key,
          "onSave",
          vscode.ConfigurationTarget.Workspace
        );
        const filename = path.join(
          directory,
          language === "python" ? "app.py" : "app.R"
        );
        fs.writeFileSync(
          filename,
          language === "python"
            ? "from shiny import render\n@render.text\ndef result():\n    return input.n\n"
            : "library(shiny)\ndata <- reactive({1})\nresult <- data\n"
        );
        const document = await vscode.workspace.openTextDocument(filename);
        await vscode.window.showTextDocument(document);
        assert.deepStrictEqual(
          vscode.languages.getDiagnostics(document.uri),
          []
        );
        const edit = new vscode.WorkspaceEdit();
        edit.insert(document.uri, new vscode.Position(0, 0), "# edited\n");
        assert.ok(await vscode.workspace.applyEdit(edit));
        assert.deepStrictEqual(
          vscode.languages.getDiagnostics(document.uri),
          []
        );
        assert.ok(await document.save());
        await waitFor(() =>
          vscode.languages
            .getDiagnostics(document.uri)
            .some(
              (diagnostic) =>
                diagnostic.code ===
                  (language === "python"
                    ? "UNCALLED_INPUT"
                    : "shiny.uncalledReactive") &&
                diagnostic.severity === vscode.DiagnosticSeverity.Error &&
                diagnostic.range.start.line === (language === "python" ? 4 : 3)
            )
        );
      } finally {
        await vscode.commands.executeCommand(
          "workbench.action.revertAndCloseActiveEditor"
        );
        await configuration.update(
          key,
          previous,
          vscode.ConfigurationTarget.Workspace
        );
        fs.rmSync(directory, { recursive: true, force: true });
      }
    });
  }

  for (const language of ["python", "r"] as const) {
    for (const setting of ["run", "enable"] as const) {
      test(`Manual validation publishes ${language} Problems with ${setting} disabled`, async () => {
        const extension = vscode.extensions.getExtension("Posit.shiny");
        assert.ok(extension);
        await extension.activate();
        const configuration = vscode.workspace.getConfiguration("shiny");
        const key = `diagnostics.${language}.${setting}`;
        const previous = configuration.inspect(key)?.workspaceValue;
        try {
          await configuration.update(
            key,
            setting === "run" ? "off" : false,
            vscode.ConfigurationTarget.Workspace
          );
          const document = await vscode.workspace.openTextDocument({
            language,
            content:
              language === "python"
                ? "from shiny import render\n@render.text\ndef result():\n    return input.n\n"
                : "library(shiny)\ndata <- reactive({1})\nresult <- data\n",
          });
          await vscode.window.showTextDocument(document);
          assert.deepStrictEqual(
            vscode.languages.getDiagnostics(document.uri),
            []
          );
          await vscode.commands.executeCommand("shiny.validateApp");
          const diagnostics = vscode.languages
            .getDiagnostics(document.uri)
            .filter((diagnostic) => diagnostic.source === "shiny");
          assert.strictEqual(diagnostics.length, 1);
          assert.strictEqual(
            diagnostics[0].code,
            language === "python" ? "UNCALLED_INPUT" : "shiny.uncalledReactive"
          );
        } finally {
          await vscode.commands.executeCommand(
            "workbench.action.revertAndCloseActiveEditor"
          );
          await configuration.update(
            key,
            previous,
            vscode.ConfigurationTarget.Workspace
          );
        }
      });
    }
  }

  test("Extension activation loads parsers and publishes suppressed document diagnostics", async () => {
    const extension = vscode.extensions.getExtension("Posit.shiny");
    assert.ok(extension, "Shiny extension must be installed in the test host");
    await extension.activate();
    const document = await vscode.workspace.openTextDocument({
      language: "python",
      content: `from shiny import render
@render.text
def result():
    first = input.n  # shiny: ignore UNCALLED_INPUT
    return input.n
`,
    });
    await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand("shiny.validateApp");
    const diagnostics = vscode.languages
      .getDiagnostics(document.uri)
      .filter((diagnostic) => diagnostic.source === "shiny");
    assert.strictEqual(diagnostics.length, 1);
    assert.strictEqual(diagnostics[0].code, "UNCALLED_INPUT");
    assert.strictEqual(diagnostics[0].range.start.line, 4);
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  });
});
