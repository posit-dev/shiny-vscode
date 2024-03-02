import { PythonExtension } from "@vscode/python-extension";
import * as vscode from "vscode";
import { openBrowser, openBrowserWhenReady } from "./net-utils";
import {
  envVarsForShell as envVarsForTerminal,
  escapeCommandForTerminal,
} from "./shell-utils";
import { getAppPort, getAutoreloadPort } from "./port-settings";

const DEBUG_NAME = "Debug Shiny app";

export async function runApp(): Promise<void> {
  const path = getActiveEditorFile();
  if (!path) {
    return;
  }

  const python = await getSelectedPythonInterpreter();
  if (!python) {
    return;
  }

  const port = await getAppPort("run");
  const autoreloadPort = await getAutoreloadPort("run");

  const terminal = await createTerminalAndCloseOthersWithSameName({
    name: "Shiny",
    env: {
      // We store the Python path here so we know whether the terminal can be
      // reused by us in the future (yes if the selected Python interpreter has
      // changed, no if it has). Currently we don't ever reuse terminals,
      // instead we always close the old ones--but this could change in the
      // future.
      // eslint-disable-next-line @typescript-eslint/naming-convention
      PYSHINY_EXEC_CMD: python,
      // We save this here so escapeCommandForTerminal knows what shell
      // semantics to use when escaping arguments. A bit magical, but oh well.
      ...envVarsForTerminal(),
    },
  });

  const args: string[] = ["-m", "shiny", "run"];
  args.push("--port", port + "");
  args.push("--reload");
  args.push("--autoreload-port", autoreloadPort + "");
  args.push(path);
  const cmdline = escapeCommandForTerminal(terminal, python, args);
  terminal.sendText(cmdline);

  // Clear out the browser. Without this it can be a little confusing as to
  // whether the app is trying to load or not.
  openBrowser("about:blank");
  // If we start too quickly, openBrowserWhenReady may detect the old Shiny
  // process (in the process of shutting down), not the new one. Give it a
  // second. It's a shame to wait an extra second, but it's only when the Play
  // button is hit, not on autoreload.
  await new Promise((resolve) => setTimeout(resolve, 1000));

  if (process.env["CODESPACES"] === "true") {
    // Codespaces has a port forwarding system that has an interesting auth
    // system. By default, forwarded ports are private, and each forwarded port
    // is served at a different hostname. Authentication is handled in one of
    // two ways: 1) in a browser, you would attempt to navigate to a page and it
    // would send you through an authentication flow, resulting in cookies being
    // set; or 2) for an API call, you can add a custom header with a GitHub
    // token. Our autoreload WebSocket client wants to connect, but it can't add
    // custom headers (the browser WebSocket client intentionally doesn't
    // support it). So we need to navigate the browser to the autoreload port to
    // get the cookies set. Fortunately, Shiny's autoreload port does nothing
    // but redirect you to the main port.
    //
    // So that's what we do on Cloudspaces: send the browser to the autoreload
    // port instead of the main port.
    await openBrowserWhenReady(autoreloadPort, port);
  } else {
    // For non-Cloudspace environments, simply go to the main port.
    await openBrowserWhenReady(port, autoreloadPort);
  }
}

export async function debugApp(): Promise<void> {
  if (vscode.debug.activeDebugSession?.name === DEBUG_NAME) {
    await vscode.debug.stopDebugging(vscode.debug.activeDebugSession);
  }

  const path = getActiveEditorFile();
  if (!path) {
    return;
  }

  const python = await getSelectedPythonInterpreter();
  if (!python) {
    return;
  }

  const port = await getAppPort("debug");

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

async function createTerminalAndCloseOthersWithSameName(
  options: vscode.TerminalOptions
): Promise<vscode.Terminal> {
  if (!options.name) {
    throw new Error("Terminal name is required");
  }

  // Grab a list of all terminals with the same name, before we create the new
  // one. We'll close them. (It'd be surprising if there was more than one,
  // given that we always close the previous ones when starting a new one.)
  const oldTerminals = vscode.window.terminals.filter(
    (term) => term.name === options.name
  );

  const newTerm = vscode.window.createTerminal(options);
  newTerm.show(true);

  // Wait until new terminal is showing before disposing the old ones.
  // Otherwise we get a flicker of some other terminal in the in-between time.

  const closingTerminals = oldTerminals.map((x) => {
    const p = new Promise<void>((resolve) => {
      // Resolve when the terminal is closed
      const subscription = vscode.window.onDidCloseTerminal(function sub(term) {
        if (term === x) {
          subscription.dispose();
          resolve();
        }
      });
    });
    x.dispose();
    return p;
  });
  await Promise.allSettled(closingTerminals);

  return newTerm;
}

/**
 * Gets the currently selected Python interpreter, according to the Python extension.
 * @returns A path, or false if no interpreter is selected.
 */
async function getSelectedPythonInterpreter(): Promise<string | false> {
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

  return resolvedEnv.path;
}

function getActiveEditorFile(): string | undefined {
  const appPath = vscode.window.activeTextEditor?.document.uri.fsPath;
  if (typeof appPath !== "string") {
    vscode.window.showErrorMessage("No active file");
    return;
  }
  return appPath;
}
