import * as assert from "assert";
import * as vscode from "vscode";

suite("Shiny diagnostics integration", () => {
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
