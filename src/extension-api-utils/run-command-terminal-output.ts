import * as vscode from "vscode";

const GREEN_COLOR = "\x1b[32m";
const RESET_COLOR = "\x1b[0m";

import {
  runShellCommand,
  type CommandExecOptions,
  type CommandOutput,
} from "./runShellCommand";

type RunShellCommandWithTerminalOutputOptions = CommandExecOptions & {
  terminalName: string;
};

export async function runShellCommandWithTerminalOutput({
  cmd,
  args,
  cwd,
  env,
  terminalName,
  stdout,
  stderr,
  timeoutMs = 1500,
  verbose = false,
}: RunShellCommandWithTerminalOutputOptions): Promise<CommandOutput> {
  let pty: MyPTY;
  let terminal: vscode.Terminal | undefined = undefined;

  // TODO: reset terminal per chat message
  //
  // First look for old terminals that have the same title AND contain the
  // correct pty type. If both are satisfied, grab the pty and terminal; if
  // not, then we'll create new ones.
  const oldTerminals = vscode.window.terminals.filter(
    (term) => term.name === terminalName
  );
  if (oldTerminals.length >= 1) {
    const options = oldTerminals[0].creationOptions;
    if ("pty" in options && options.pty && options.pty instanceof MyPTY) {
      pty = options.pty;
      terminal = oldTerminals[0];
    }
  }

  // If we didn't find an existing terminal+pty, create a new one.
  if (terminal === undefined) {
    pty = new MyPTY();

    terminal = vscode.window.createTerminal({
      name: terminalName,
      pty,
    });

    // Make sure to dispose of the pty when the terminal is closed.
    const subscription = vscode.window.onDidCloseTerminal(function sub(term) {
      if (term === terminal) {
        pty.dispose();
        subscription.dispose();
      }
    });
  }

  // If we get here, pty must be defined.
  pty = pty!;

  terminal.show();

  // Don't continue until the pseudoterminal is opened; otherwise we could
  // write to the pty before it's ready and that output will be lost.
  await pty.openedPromise;

  pty.write(
    "================================================================\n"
  );
  pty.write(
    `${GREEN_COLOR}Running command: ${JSON.stringify({ cmd, args }, undefined, "  ")}${RESET_COLOR}\n`
  );
  pty.write("\n");

  const result = await runShellCommand({
    cmd,
    args,
    cwd,
    env,
    stdout: (s: string) => {
      pty.write(s);
      if (stdout) stdout(s);
    },
    stderr: (s: string) => {
      pty.write(s);
      if (stderr) stderr(s);
    },
    timeoutMs: timeoutMs,
    verbose,
  });
  return result;
}

/**
 * A custom pseudoterminal implementation for VS Code that provides a simple
 * interface for writing command output to a terminal window.
 *
 * This class implements VS Code's Pseudoterminal interface to create a custom
 * terminal that can display command output. It handles the conversion of line
 * endings and provides events for terminal interactions.
 *
 * Features:
 * - Converts '\n' to '\r\n' for proper terminal line endings
 * - Provides a Promise that resolves when the terminal is ready for input
 * - Implements the necessary VS Code terminal event emitters
 *
 * Example usage:
 * ```typescript
 * const pty = new MyPTY();
 * const terminal = vscode.window.createTerminal({ name: "Custom Terminal", pty });
 * await pty.openedPromise;
 * pty.write("Hello World");
 * ```
 */
class MyPTY implements vscode.Pseudoterminal {
  private writeEmitter: vscode.EventEmitter<string>;
  onDidWrite: vscode.Event<string>;

  private closeEmitter: vscode.EventEmitter<void>;
  onDidClose: vscode.Event<void>;

  // Promise that resolves when the terminal is opened.
  openedPromise: Promise<void>;
  private openedPromiseResolve!: () => void;

  constructor() {
    this.writeEmitter = new vscode.EventEmitter<string>();
    this.onDidWrite = this.writeEmitter.event;
    this.closeEmitter = new vscode.EventEmitter<void>();
    this.onDidClose = this.closeEmitter.event;
    this.openedPromise = new Promise((resolve) => {
      this.openedPromiseResolve = resolve;
    });
  }

  // Handle input from the user.
  // handleInput(s: string) {
  //   this.writeEmitter.fire(s === "\r" ? "\r\n" : s);
  // }

  write(s: string) {
    this.writeEmitter.fire(s.replaceAll("\n", "\r\n"));
  }

  open() {
    this.openedPromiseResolve();
  }

  close() {
    this.writeEmitter.dispose();
    this.closeEmitter.dispose();
  }

  dispose() {
    this.close();
  }
}
