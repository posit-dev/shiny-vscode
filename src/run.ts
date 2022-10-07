import * as vscode from "vscode";
import * as http from "http";
import { retryUntilTimeout } from "./retry-utils";
import { TERMINAL_NAME, PYSHINY_EXEC_CMD } from "./extension";
import { AddressInfo } from "net";
import { resolve } from "path";

export async function runApp(context: vscode.ExtensionContext) {
  const port: number =
    vscode.workspace.getConfiguration("shiny.python").get("port") ||
    (await defaultPort(context));

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
    await retryUntilTimeout(10000, () => isPortOpen("127.0.0.1", port));
  } catch {
    // Failed to connect. Don't bother trying to launch a browser
    console.warn("Failed to connect to Shiny app, not launching browser");
    return;
  }

  vscode.commands.executeCommand(
    "simpleBrowser.api.open",
    `http://127.0.0.1:${port}`,
    {
      preserveFocus: true,
      viewColumn: vscode.ViewColumn.Beside,
    }
  );
}

// Ports that are considered unsafe by Chrome
// http://superuser.com/questions/188058/which-ports-are-considered-unsafe-on-chrome
// https://github.com/rstudio/shiny/issues/1784
const UNSAFE_PORTS = [
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 77, 79, 87,
  95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 139, 143,
  179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 556,
  563, 587, 601, 636, 993, 995, 2049, 3659, 4045, 6000, 6665, 6666, 6667, 6668,
  6669, 6697,
];

async function defaultPort(context: vscode.ExtensionContext): Promise<number> {
  // Retrieve most recently used port
  let port: number = context.workspaceState.get("transient_port", 0);
  while (port === 0 || !(await verifyPort(port))) {
    do {
      port = await suggestPort();
      // Ports that are considered unsafe by Chrome
      // http://superuser.com/questions/188058/which-ports-are-considered-unsafe-on-chrome
      // https://github.com/rstudio/shiny/issues/1784
    } while (UNSAFE_PORTS.includes(port));
    await context.workspaceState.update("transient_port", port);
  }
  return port;
}

async function suggestPort(): Promise<number> {
  const server = http.createServer();

  const p = new Promise<number>((resolve, reject) => {
    server.on("listening", () =>
      resolve((server.address() as AddressInfo).port)
    );
    server.on("error", reject);
  }).finally(() => {
    return closeServer(server);
  });

  server.listen(0, "127.0.0.1");

  return p;
}

async function verifyPort(
  port: number,
  host: string = "127.0.0.1"
): Promise<boolean> {
  const server = http.createServer();

  const p = new Promise<boolean>((resolve, reject) => {
    server.on("listening", () => resolve(true));
    server.on("error", () => resolve(false));
  }).finally(() => {
    return closeServer(server);
  });

  server.listen(port, host);

  return p;
}

async function closeServer(server: http.Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.close((errClose) => {
      if (errClose) {
        // Don't bother logging, we don't care (e.g. if the server
        // failed to listen, close() will fail)
      }
      // Whether close succeeded or not, we're now ready to continue
      resolve();
    });
  });
}
