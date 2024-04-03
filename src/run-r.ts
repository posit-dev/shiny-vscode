import * as vscode from "vscode";
import { openBrowser, openBrowserWhenReady } from "./net-utils";
import {
  envVarsForShell as envVarsForTerminal,
  escapeCommandForTerminal,
} from "./shell-utils";
import { getAppPort } from "./port-settings";

export async function runApp(): Promise<void> {
  const path = getActiveEditorFile();
  if (!path) {
    return;
  }

  const port = await getAppPort("run", "r");
  // TODO: Is this needed for Shiny for R too?
  // const autoreloadPort = await getAutoreloadPort("run");

  const terminal = await createTerminalAndCloseOthersWithSameName({
    name: "Shiny",
    env: {
      // We save this here so escapeCommandForTerminal knows what shell
      // semantics to use when escaping arguments. A bit magical, but oh well.
      ...envVarsForTerminal(),
    },
  });

  const useDevmode = vscode.workspace
    .getConfiguration("shiny.r")
    .get("devmode");

  const devOrReload = useDevmode
    ? "shiny::devmode()"
    : "options(shiny.autoreload = TRUE)";

  const runApp = `${devOrReload}; shiny::runApp("${path}", port=${port}, launch.browser=FALSE)`;

  const cmdline = escapeCommandForTerminal(terminal, "Rscript", ["-e", runApp]);
  terminal.sendText(cmdline);

  // Clear out the browser. Without this it can be a little confusing as to
  // whether the app is trying to load or not.
  openBrowser("about:blank");
  // If we start too quickly, openBrowserWhenReady may detect the old Shiny
  // process (in the process of shutting down), not the new one. Give it a
  // second. It's a shame to wait an extra second, but it's only when the Play
  // button is hit, not on autoreload.
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // if (process.env["CODESPACES"] === "true") {
  // TODO: Support Codespaces
  await openBrowserWhenReady(port);
}

// TODO: Support debugging a Shiny for R app

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
      // Resolve when the terminal is closed. We're working hard to be accurate
      // BUT empirically it doesn't seem like the old Shiny processes are
      // actually terminated at the time this promise is resolved, so callers
      // shouldn't assume that.
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

function getActiveEditorFile(): string | undefined {
  const appPath = vscode.window.activeTextEditor?.document.uri.fsPath;
  if (typeof appPath !== "string") {
    vscode.window.showErrorMessage("No active file");
    return;
  }
  return appPath;
}
