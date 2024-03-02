import { PythonExtension } from "@vscode/python-extension";
import * as http from "http";
import * as net from "net";
import { AddressInfo } from "net";
import * as vscode from "vscode";
import {
  PYSHINY_EXEC_CMD,
  PYSHINY_EXEC_SHELL,
  TERMINAL_NAME,
} from "./constants";
import { getRemoteSafeUrl } from "./extension-api-utils/getRemoteSafeUrl";
import { retryUntilTimeout } from "./retry-utils";
import { escapeCommandForTerminal } from "./shell-utils";

const DEBUG_NAME = "Debug Shiny app";

export async function runApp(context: vscode.ExtensionContext) {
  runAppImpl(context, "run", true, async (path, port, autoreloadPort) => {
    // Gather details of the current Python interpreter. We want to make sure
    // only to re-use a terminal if it's using the same interpreter.
    const pythonAPI: PythonExtension = await PythonExtension.api();

    // The getActiveEnvironmentPath docstring says: "Note that this can be an
    // invalid environment, use resolveEnvironment to get full details."
    const unresolvedEnv = pythonAPI.environments.getActiveEnvironmentPath(
      vscode.window.activeTextEditor?.document.uri
    );
    const resolvedEnv = await pythonAPI.environments.resolveEnvironment(
      unresolvedEnv
    );
    if (!resolvedEnv) {
      vscode.window.showErrorMessage(
        "Unable to find Python interpreter. " +
          'Please use the "Python: Select Interpreter" command, and try again.'
      );
      return false;
    }

    const pythonExecCommand = resolvedEnv.path;

    const shinyTerminals = vscode.window.terminals.filter(
      (term) => term.name === TERMINAL_NAME
    );

    const shinyTerm = vscode.window.createTerminal({
      name: TERMINAL_NAME,
      env: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        [PYSHINY_EXEC_CMD]: pythonExecCommand,
        [PYSHINY_EXEC_SHELL]: vscode.env.shell,
      },
    });
    shinyTerm.show(true);

    // Wait until new terminal is showing before disposing the old one.
    // Otherwise we get a flicker of some other terminal in the in-between time.

    const oldTerminals = shinyTerminals.map((x) => {
      const p = new Promise<void>((resolve) => {
        const subscription = vscode.window.onDidCloseTerminal(function sub(
          term
        ) {
          if (term === x) {
            subscription.dispose();
            resolve();
          }
        });
      });
      x.dispose();
      return p;
    });
    await Promise.allSettled(oldTerminals);

    const args = ["-m", "shiny", "run", "--port", port + "", "--reload", path];
    const cmd = escapeCommandForTerminal(shinyTerm, pythonExecCommand, args);
    shinyTerm.sendText(cmd);

    return true;
  });
}

export async function debugApp(context: vscode.ExtensionContext) {
  runAppImpl(context, "debug", false, async (path, port) => {
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
  reason: "run" | "debug",
  autoreload: boolean,
  launch: (
    path: string,
    port: number,
    autoreloadPort?: number
  ) => Promise<boolean>
) {
  const port: number =
    vscode.workspace.getConfiguration("shiny.python").get("port") ||
    (await defaultPort(context, `shiny_app_${reason}`));

  const autoreloadPort: number | undefined = autoreload
    ? await defaultPort(context, `shiny_autoreload_${reason}`)
    : undefined;

  const appPath = vscode.window.activeTextEditor?.document.uri.fsPath;
  if (typeof appPath !== "string") {
    vscode.window.showErrorMessage("No active file");
    return;
  }

  if (await launch(appPath, port, autoreloadPort)) {
    openBrowser("about:blank");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await openBrowserWhenReady(port, autoreloadPort);
  }
}

async function isPortOpen(host: string, port: number): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const client = new net.Socket();

    client.setTimeout(1000);
    client.connect(port, host, function () {
      resolve(true);
      client.end();
    });

    client.on("timeout", () => {
      client.destroy();
      reject(new Error("Timed out"));
    });

    client.on("error", (err) => {
      reject(err);
    });

    client.on("close", () => {
      reject(new Error("Connection closed"));
    });
  });
}

async function openBrowserWhenReady(port: number, autoreloadPort?: number) {
  try {
    await retryUntilTimeout(10000, () => isPortOpen("127.0.0.1", port));
    if (autoreloadPort) {
      await retryUntilTimeout(10000, () =>
        isPortOpen("127.0.0.1", autoreloadPort)
      );
    }
  } catch {
    // Failed to connect. Don't bother trying to launch a browser
    console.warn("Failed to connect to Shiny app, not launching browser");
    return;
  }

  const portToUse =
    autoreloadPort && process.env["CODESPACES"] === "true"
      ? autoreloadPort
      : port;

  let previewUrl = await getRemoteSafeUrl(portToUse);
  await openBrowser(previewUrl);
}

async function openBrowser(url: string): Promise<void> {
  // if (process.env["CODESPACES"] === "true") {
  //   vscode.env.openExternal(vscode.Uri.parse(url));
  // } else {
  await vscode.commands.executeCommand("simpleBrowser.api.open", url, {
    preserveFocus: true,
    viewColumn: vscode.ViewColumn.Beside,
  });
  // }
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

async function defaultPort(
  context: vscode.ExtensionContext,
  portType: string
): Promise<number> {
  // Retrieve most recently used port
  let port: number = context.workspaceState.get(
    "transient_port_" + portType,
    0
  );

  if (port !== 0) {
    return port;
  }

  do {
    port = await suggestPort();
    // Ports that are considered unsafe by Chrome
    // http://superuser.com/questions/188058/which-ports-are-considered-unsafe-on-chrome
    // https://github.com/rstudio/shiny/issues/1784
  } while (UNSAFE_PORTS.includes(port));
  await context.workspaceState.update("transient_port_" + portType, port);

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
