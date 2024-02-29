import * as vscode from "vscode";
import { PYSHINY_EXEC_SHELL } from "./constants";

type EscapeStyle = "cmd" | "ps" | "sh";

function escapeStyle(terminal: vscode.Terminal): EscapeStyle {
  const termEnv =
    (terminal.creationOptions as vscode.TerminalOptions).env || {};
  const shellPath = termEnv[PYSHINY_EXEC_SHELL] ?? "";

  if (/\bcmd\.exe$/i.test(shellPath)) {
    return "cmd";
  } else if (/\bpowershell.exe$/i.test(shellPath)) {
    return "ps";
  } else {
    return "sh";
  }
}

export function escapeArg(filePath: string, style: EscapeStyle): string {
  switch (style) {
    case "cmd":
      // For cmd.exe, double quotes are used to handle spaces, and carets (^) are used to escape special characters.
      const escaped = filePath.replace(/([()%!^"<>&|])/g, "^$1");
      return /\s/.test(escaped) ? `"${escaped}"` : escaped;

    case "ps":
      if (!/[ '"`,;(){}|&<>@#[\]]/.test(filePath)) {
        return filePath;
      }
      // PowerShell accepts single quotes as literal strings and does not require escaping like cmd.exe.
      // Single quotes in the path itself need to be doubled though.
      return `'${filePath.replace(/'/g, "''")}'`;

    case "sh":
      // For bash, spaces are escaped with backslashes, and special characters are handled similarly.
      return filePath.replace(/([\\ !"$`&*()|[\]{};<>?])/g, "\\$1");

    default:
      throw new Error('Unsupported style. Use "cmd", "ps", or "sh".');
  }
}

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
