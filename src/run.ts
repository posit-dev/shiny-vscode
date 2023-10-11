import * as vscode from "vscode";
import * as http from "http";
import { retryUntilTimeout } from "./retry-utils";
import { TERMINAL_NAME, PYSHINY_EXEC_CMD } from "./extension";
import { AddressInfo } from "net";
import { getRemoteSafeUrl } from "./extension-api-utils/getRemoteSafeUrl";

const DEBUG_NAME = "Debug Shiny app";

export async function runApp(context: vscode.ExtensionContext) {
  runAppImpl(context, async (path, port) => {
    // Gather details of the current Python interpreter. We want to make sure
    // only to re-use a terminal if it's using the same interpreter.
    const pythonAPI =
      vscode.extensions.getExtension("ms-python.python")!.exports;
    const pythonExecCommand = pythonAPI.environments.getActiveEnvironmentPath(
      vscode.window.activeTextEditor?.document.uri
    ).path;

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

    return true;
  });
}

export async function debugApp(context: vscode.ExtensionContext) {
  runAppImpl(context, async (path, port) => {
    if (vscode.debug.activeDebugSession?.name === DEBUG_NAME) {
      await vscode.debug.stopDebugging(vscode.debug.activeDebugSession);
    }

    const justMyCode = vscode.workspace
      .getConfiguration("shiny.python")
      .get("debugJustMyCode", true);

    await vscode.debug.startDebugging(undefined, {
      type: "python",
      name: DEBUG_NAME,
      request: "launch",
      module: "shiny",
      args: ["run", "--port", port.toString(), path],
      jinja: true,
      justMyCode,
      stopOnEntry: false,
    });

    // Don't spawn browser. We do so in onDidStartDebugSession instead, so when
    // VSCode restarts the debugger instead of us, the SimpleBrowser is still
    // opened.
    return false;
  });
}

/**
 * Template function for runApp and debugApp
 * @param context The context
 * @param launch Async function that launches the app. Returns true if
 *   runAppImpl should open a browser.
 */
async function runAppImpl(
  context: vscode.ExtensionContext,
  launch: (path: string, port: number) => Promise<boolean>
) {
  const port: number =
    vscode.workspace.getConfiguration("shiny.python").get("port") ||
    (await defaultPort(context));

  const appPath = vscode.window.activeTextEditor?.document.uri.fsPath;
  if (typeof appPath !== "string") {
    vscode.window.showErrorMessage("No active file");
    return;
  }

  if (await launch(appPath, port)) {
    await openBrowserWhenReady(port);
  }
}

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

async function openBrowserWhenReady(port: number) {
  try {
    await retryUntilTimeout(10000, () => isPortOpen("127.0.0.1", port));
  } catch {
    // Failed to connect. Don't bother trying to launch a browser
    console.warn("Failed to connect to Shiny app, not launching browser");
    return;
  }

  let previewUrl = await getRemoteSafeUrl(port);

  vscode.commands.executeCommand("simpleBrowser.api.open", previewUrl, {
    preserveFocus: true,
    viewColumn: vscode.ViewColumn.Beside,
  });
}

// Ports that are considered unsafe by Chrome
// http://superuser.com/questions/188058/which-ports-are-considered-unsafe-on-chrome
// https://github.com/rstudio/shiny/issues/1784
const UNSAFE_PORTS = [
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79,
  87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137,
  139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723,
  2049, 3659, 4045, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6697,
  10080,
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

export function onDidStartDebugSession(e: vscode.DebugSession) {
  // When a debug session starts, check if it's a Shiny session and whether we
  // can figure out the port number. If so, open a browser.

  const { type, name } = e.configuration;
  const args = e.configuration.args as string[] | undefined;

  // It's not a Shiny session
  if (type !== "python" || name !== DEBUG_NAME) {
    return;
  }

  // No arguments are present
  if (!args) {
    return;
  }

  const idxPortFlag = args.indexOf("--port");
  // No --port flag is present, or it's the last argument
  if (idxPortFlag < 0 || idxPortFlag === args.length - 1) {
    return;
  }

  const portStr = args[idxPortFlag + 1];
  // Port number is not a number
  if (!/^\d+$/.test(portStr)) {
    return;
  }

  const port = parseInt(portStr);
  // Port might be 0 which means random assignment--we don't ever set the port
  // to 0 in our code but I guess it's theoretically possible that a user could.
  if (port <= 0) {
    return;
  }

  // Finally have a valid port number! Open a browser.
  openBrowserWhenReady(port).catch((err) => {
    console.warn("Failed to open browser", err);
  });
}
