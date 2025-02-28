import * as vscode from "vscode";

const GREEN_COLOR = "\x1b[32m";
const RESET_COLOR = "\x1b[0m";

import {
  runShellCommand,
  type CommandExecOptions,
  type CommandOutput,
} from "./runShellCommand";

type RunShellCommandWithTerminalOutputOptions = CommandExecOptions & {
  newTerminalName: string;
  terminal?: TerminalWithMyPty;
};

export async function runShellCommandWithTerminalOutput({
  cmd,
  args,
  cwd,
  env,
  terminal, // If defined, a Terminal to use instead of creating a new one
  newTerminalName, // If `terminal` was not passed in, create a Terminal with this name
  stdout,
  stderr,
  timeoutMs = 1500,
  verbose = false,
}: RunShellCommandWithTerminalOutputOptions): Promise<{
  cmdResult: CommandOutput;
  terminal: TerminalWithMyPty;
}> {
  let pty: MyPTY;

  // If we were passed a terminal, use it.
  if (terminal) {
    pty = terminal.creationOptions.pty;
  } else {
    // First look for old terminals that have the same title AND contain the
    // correct pty type, and dispose of them
    vscode.window.terminals.forEach((term) => {
      const options = term.creationOptions;
      if (
        term.name === newTerminalName &&
        "pty" in options &&
        options.pty &&
        options.pty instanceof MyPTY
      ) {
        term.dispose();
      }
    });

    terminal = createTerminalWithMyPty(newTerminalName);
    pty = terminal.creationOptions.pty;
  }

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

  const cmdResult = await runShellCommand({
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

  return { cmdResult, terminal };
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

/**
 * A TerminalWithMyPty is a vscode.Terminal that was created with a pty: MyPTY
 * object.
 */
export interface TerminalWithMyPty extends vscode.Terminal {
  creationOptions: Readonly<vscode.ExtensionTerminalOptions & { pty: MyPTY }>;
}

/**
 * Creates a terminal with a MyPTY.
 * @param terminalName The name of the terminal.
 * @returns A TerminalWithMyPty object.
 */
export function createTerminalWithMyPty(
  terminalName: string
): TerminalWithMyPty {
  const pty = new MyPTY();

  const terminal = vscode.window.createTerminal({
    name: terminalName,
    pty,
  }) as TerminalWithMyPty;

  // Make sure to dispose of the pty when the terminal is closed.
  const subscription = vscode.window.onDidCloseTerminal(function sub(term) {
    if (term === terminal) {
      pty.dispose();
      subscription.dispose();
    }
  });

  return terminal;
}
