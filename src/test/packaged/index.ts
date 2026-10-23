import * as assert from "assert";
import * as vscode from "vscode";

// Runs only against the extracted VSIX, including its failure scenarios.
export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension("Posit.shiny");
  assert.ok(extension, "Packaged Shiny extension must be present");
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
    if (process.env.SHINY_TEST_MISSING_PARSER) {
      assert.deepStrictEqual(diagnostics, []);
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
}
