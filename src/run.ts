import * as vscode from "vscode";
import * as http from "http";
import { retryUntilTimeout } from "./retry-utils";
import { TERMINAL_NAME, PYSHINY_EXEC_CMD } from "./extension";

export async function runApp() {
  const port: number =
    vscode.workspace.getConfiguration("shiny.python").get("port") ?? 8000;

  // Gather details of the current Python interpreter. We want to make sure
  // only to re-use a terminal if it's using the same interpreter.
  const pythonAPI = vscode.extensions.getExtension("ms-python.python")!.exports;
  const pythonExecCommand = (
    await pythonAPI.environment.getExecutionDetails(
      vscode.window.activeTextEditor?.document.uri
    )
  ).execCommand.join(" ");

  const shinyTerminals = vscode.window.terminals.filter(
    (term) => term.name === TERMINAL_NAME
  );

  let shinyTerm = shinyTerminals.find((x) => {
    const env = (x.creationOptions as Readonly<vscode.TerminalOptions>)?.env;
    const canUse = env && env[PYSHINY_EXEC_CMD] === pythonExecCommand;
    if (!canUse) {
      // Existing Terminal windows named $TERMINAL_NAME but not using the
      // correct Python interpreter are closed.
      x.dispose();
    }
    return canUse;
  });

  if (!shinyTerm) {
    shinyTerm = vscode.window.createTerminal({
      name: TERMINAL_NAME,
      env: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        [PYSHINY_EXEC_CMD]: pythonExecCommand,
      },
    });
  } else {
    // Send Ctrl+C to interrupt any existing Shiny process
    shinyTerm.sendText("\u0003");
  }
  // Wait for shell to be created, or for existing process to be interrupted
  await new Promise((resolve) => setTimeout(resolve, 250));
  shinyTerm.show(true);

  const filePath = vscode.window.activeTextEditor?.document.uri.fsPath;
  // TODO: Bash-escape filePath more completely than this?
  shinyTerm.sendText(pythonExecCommand, false);
  shinyTerm.sendText(
    ` -m shiny run --port ${port} --reload "${filePath?.replace(
      /([\\"])/g,
      "\\$1"
    )}"`
  );

  // TODO: Wait until the port is available
  async function isPortOpen(host: string, port: number): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const options = {
        hostname: host,
        port,
        path: "/",
        method: "GET",
      };
      const req = http.request(options, (res) => {
        resolve(true);
        res.destroy();
        req.destroy();
      });
      req.on("error", (err) => {
        reject(err);
      });
      req.end();
    });
  }

  try {
    await retryUntilTimeout(10000, () => isPortOpen("localhost", port));
  } catch {
    // Failed to connect. Don't bother trying to launch a browser
    console.warn("Failed to connect to Shiny app, not launching browser");
    return;
  }

  vscode.commands.executeCommand(
    "simpleBrowser.api.open",
    `http://localhost:${port}`,
    {
      preserveFocus: true,
      viewColumn: vscode.ViewColumn.Beside,
    }
  );
}
