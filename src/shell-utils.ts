import * as vscode from "vscode";

type EscapeStyle = "cmd" | "ps" | "sh";
const PYSHINY_EXEC_SHELL = "PYSHINY_EXEC_SHELL";

/**
 * Determine the escaping style to use for a terminal.
 * @param terminal The terminal to determine the escaping style for.
 * @returns The escaping style to use.
 */
function escapeStyle(terminal: vscode.Terminal): EscapeStyle {
  const termEnv =
    (terminal.creationOptions as vscode.TerminalOptions).env || {};
  const shellPath = termEnv[PYSHINY_EXEC_SHELL] ?? "";

  if (/\bcmd\.exe$/i.test(shellPath)) {
    return "cmd";
  } else if (/\b(powershell|pwsh).exe$/i.test(shellPath)) {
    return "ps";
  } else {
    return "sh";
  }
}

/**
 * Escape a single argument for use in a shell command. Varies behavior
 * depending on the desired escaping style.
 * @param arg The arg value to escape.
 * @param style One of "cmd", "ps", or "sh".
 * @returns An escaped version of the argument.
 */
export function escapeArg(arg: string, style: EscapeStyle): string {
  switch (style) {
    case "cmd":
      // For cmd.exe, double quotes are used to handle spaces, and carets (^) are used to escape special characters.
      const escaped = arg.replace(/([()%!^"<>&|])/g, "^$1");
      return /\s/.test(escaped) ? `"${escaped}"` : escaped;

    case "ps":
      if (!/[ '"`,;(){}|&<>@#[\]]/.test(arg)) {
        return arg;
      }
      // PowerShell accepts single quotes as literal strings and does not require escaping like cmd.exe.
      // Single quotes in the path itself need to be doubled though.
      return `'${arg.replace(/'/g, "''")}'`;

    case "sh":
      // For bash, spaces are escaped with backslashes, and special characters are handled similarly.
      return arg.replace(/([\\ !"$`&*()|[\]{};<>?])/g, "\\$1");

    default:
      throw new Error('Unsupported style. Use "cmd", "ps", or "sh".');
  }
}

/**
 *
 * @param terminal The terminal to escape the command for.
 * @param exec The command to execute. Can be null if only args are needed (e.g.
 * if you're adding additional arguments to an existing command line).
 * @param args Arguments to the command, if any.
 * @returns The escaped command line. If the terminal is PowerShell, the command
 * is prefixed with "& ".
 */
export function escapeCommandForTerminal(
  terminal: vscode.Terminal,
  exec: string | null,
  args: string[]
): string {
  const shell = escapeStyle(terminal);

  const cmd = [exec]
    .concat(...args)
    .filter((x) => x !== null)
    .map((x) => escapeArg(x as string, shell))
    .join(" ");

  if (shell === "ps" && exec) {
    return "& " + cmd;
  } else {
    return cmd;
  }
}

/**
 * Save metadata to the terminal's environment so we can retrieve it later, to
 * determine how to escape arguments.
 * @returns A map of env vars to include in the terminal's environment.
 */
export function envVarsForShell(): Record<string, string> {
  return {
    [PYSHINY_EXEC_SHELL]: vscode.env.shell,
  };
}
