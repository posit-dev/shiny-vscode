import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { initializeParsers } from "../../diagnostics/parser";
import { ShinyDiagnosticsController } from "../../diagnostics/validator";

suite("Shiny diagnostics integration", () => {
  for (const language of ["python", "r"] as const) {
    test(`${language} onSave waits for a save on open, refresh, and edit`, async () => {
      const extension = vscode.extensions.getExtension("Posit.shiny");
      assert.ok(extension);
      await extension.activate();
      await initializeParsers(path.resolve(__dirname, "../../parsers"));
      const configuration = vscode.workspace.getConfiguration("shiny");
      const key = `diagnostics.${language}.run`;
      const previous = configuration.inspect(key)?.workspaceValue;
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "shiny-save-"));
      let controller: ShinyDiagnosticsController | undefined;
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
        controller = new ShinyDiagnosticsController();
        controller.refreshAll();
        assert.deepStrictEqual(
          vscode.languages.getDiagnostics(document.uri),
          []
        );
        const edit = new vscode.WorkspaceEdit();
        edit.insert(document.uri, new vscode.Position(0, 0), "# edited\n");
        assert.ok(await vscode.workspace.applyEdit(edit));
        await new Promise((resolve) => setTimeout(resolve, 350));
        assert.deepStrictEqual(
          vscode.languages.getDiagnostics(document.uri),
          []
        );
        assert.ok(await document.save());
        assert.ok(
          vscode.languages
            .getDiagnostics(document.uri)
            .some((diagnostic) => diagnostic.source === "shiny")
        );
      } finally {
        controller?.dispose();
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
