import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { detectShinyApp, forgetShinyApp } from "../../app-contexts";

suite("Shiny app resource context keys", () => {
  let tempDir: string;
  let contextByKey: Map<string, unknown>;
  let originalExecuteCommand: typeof vscode.commands.executeCommand;

  setup(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiny-app-contexts-"));
    contextByKey = new Map();

    // Record setContext calls instead of applying them.
    originalExecuteCommand = vscode.commands.executeCommand;
    vscode.commands.executeCommand = (async (
      command: string,
      ...args: unknown[]
    ) => {
      if (command === "setContext") {
        contextByKey.set(args[0] as string, args[1]);
        return;
      }
      return originalExecuteCommand(command, ...args);
    }) as typeof vscode.commands.executeCommand;
  });

  teardown(() => {
    vscode.commands.executeCommand = originalExecuteCommand;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /** Write a file to the temp dir and open it as a text document. */
  async function openDocument(
    filename: string,
    content: string
  ): Promise<vscode.TextDocument> {
    const filePath = path.join(tempDir, filename);
    fs.writeFileSync(filePath, content);
    return vscode.workspace.openTextDocument(filePath);
  }

  test("Track Python and R Shiny apps by their own document", async () => {
    const pyApp = await openDocument("app.py", "from shiny import App\n");
    const rApp = await openDocument("app.R", "library(shiny)\n");

    detectShinyApp(pyApp);
    detectShinyApp(rApp);

    assert.deepStrictEqual(contextByKey.get("shiny.python.appResources"), [
      pyApp.uri.toString(),
    ]);
    assert.deepStrictEqual(contextByKey.get("shiny.r.appResources"), [
      rApp.uri.toString(),
    ]);
  });

  test("Ignore documents that are not Shiny apps", async () => {
    const script = await openDocument("script.py", "from shiny import App\n");
    const dashApp = await openDocument("dash_app.py", "import dash\n");

    detectShinyApp(script);
    detectShinyApp(dashApp);

    // Nothing changed, so the context keys weren't updated.
    assert.strictEqual(
      contextByKey.get("shiny.python.appResources"),
      undefined
    );
  });

  test("Stop tracking an app when it is forgotten", async () => {
    const rApp = await openDocument("app.R", "library(shiny)\n");

    detectShinyApp(rApp);
    assert.ok(
      (contextByKey.get("shiny.r.appResources") as string[]).includes(
        rApp.uri.toString()
      )
    );

    forgetShinyApp(rApp);
    assert.ok(
      !(contextByKey.get("shiny.r.appResources") as string[]).includes(
        rApp.uri.toString()
      )
    );
  });
});
