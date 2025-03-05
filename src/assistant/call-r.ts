import * as vscode from "vscode";
import {
  runShellCommandWithTerminalOutput,
  type TerminalWithMyPty,
} from "../extension-api-utils/run-command-terminal-output";
import { getRBinPath } from "../run";
import { type JSONifiable } from "./types";

/**
 * Executes an R function with the specified arguments in a VS Code terminal.
 *
 * This function:
 * 1. Locates the R runtime (Rscript)
 * 2. Sources any provided R scripts
 * 3. Calls the specified R function with the provided arguments
 * 4. Captures and returns the function's output
 *
 * The R function's arguments are passed as JSON and converted to R objects. The
 * R function's return value is converted back to JSON and returned as a string.
 *
 * @param functionName - Name of the R function to call
 * @param namedArgs - Object containing named arguments to pass to the R
 * function
 * @param opts - Configuration options
 * @param opts.env - Environment variables for the R process
 * @param opts.scriptPaths - Optional array of R script paths to source before
 * calling the function
 * @param opts.terminal - Optional VS Code terminal to reuse
 * @param opts.newTerminalName - Name for the new terminal if one needs to be
 * created
 *
 * @returns A Promise that resolves to the function's output as a string. If R
 *          is not installed, returns an error message. If the R function
 *          execution fails, appends an error message.
 *
 * @example
 * const result = await callRFunction("mean", { x: [1, 2, 3] }, {
 *   newTerminalName: "R Terminal"
 * });
 */
export async function callRFunction(
  functionName: string,
  namedArgs: Record<string, JSONifiable>,
  opts: {
    env: Record<string, string>;
    scriptPaths?: string[];
    terminal?: TerminalWithMyPty;
    newTerminalName: string;
  }
): Promise<string> {
  const langRuntimePath = await getRBinPath("Rscript");
  if (!langRuntimePath) {
    return "Could not find R runtime. It seems to not be installed.";
  }

  // If there are any script paths, we will source them before running the
  // function. This is useful for sourcing scripts that contain the function
  // definition.
  const sourceScriptPathArgs: string[] = (opts.scriptPaths ?? []).flatMap(
    (scriptPath) => ["-e", `source("${scriptPath}")`]
  );

  const rBinArgs = [
    ...sourceScriptPathArgs,
    "-e",
    ".args <- json_parse_args()",
    "-e",
    `.res <- do.call(${functionName}, .args)`,
    "-e",
    "cat(to_json(.res))",
    // Pass in the JSON representation of namedArgs as a command line argument
    // which will be picked up by commandArgs() in R.
    JSON.stringify(namedArgs),
  ];

  let resultString = "";
  const appendToResultString = (s: string) => {
    resultString += s;
  };

  const res = await runShellCommandWithTerminalOutput({
    cmd: langRuntimePath,
    args: rBinArgs,
    terminal: opts.terminal,
    newTerminalName: opts.newTerminalName,
    cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    stdout: appendToResultString,
    stderr: appendToResultString,
  });
  // Store terminal for future calls
  opts.terminal = res.terminal;

  if (res.cmdResult.status === "error") {
    resultString += `\nError running R function.`;
  }

  return resultString;
}

/**
 * Converts a JavaScript/TypeScript value into a string of R code, which, when
 * evaluated, returns an R representation of the original JSONifiable input.
 *
 * @param x - The value to convert. Can be a string, number, boolean, null,
 * array, or object.
 * @returns A string representation of the value that can be evaluated in R.
 * @throws {Error} If the input type is not supported (e.g., undefined or
 * function).
 *
 * @example
 * toRString("hello") // Returns '"hello"'
 * toRString(42) // Returns '42'
 * toRString(true) // Returns 'TRUE'
 * toRString(null) // Returns 'NULL'
 * toRString([1, "a"]) // Returns 'list(1, "a")'
 * toRString({x: 1, y: "a"}) // Returns 'list(`x` = 1, `y` = "a")'
 */
export function toRString(x: JSONifiable): string {
  if (typeof x === "string" || typeof x === "number") {
    return JSON.stringify(x);
  } else if (typeof x === "boolean") {
    return x ? "TRUE" : "FALSE";
  } else if (x === null) {
    return "NULL";
  } else if (Array.isArray(x)) {
    return `list(${x.map(toRString).join(", ")})`;
  } else if (typeof x === "object") {
    return `list(${Object.entries(x)
      .map(([k, v]) => `\`${k}\` = ${toRString(v)}`)
      .join(", ")})`;
  } else {
    throw new Error(`Unsupported type: ${typeof x}`);
  }
}

/**
 * Converts a JavaScript object to an R function argument string.
 *
 * This function takes a JavaScript object and converts it to a string
 * representation of R function arguments. It first converts the object to an
 * R-compatible string using `toRString()`, which produces a string in the
 * format `list(key1 = value1, key2 = value2)`. It then removes the leading
 * `list` to return just the contents of the parentheses.
 *
 * @param args - Object containing key-value pairs to convert to R function arguments
 * @returns String representation of R function arguments without the list wrapper
 * @throws Error if the result from `toRString()` doesn't have the expected format
 */
export function argsToRString(args: Record<string, JSONifiable>): string {
  const res = toRString(args);
  // Remove leading "list"
  if (!(res.startsWith("list(") && res.endsWith(")"))) {
    throw new Error(`Unexpected format: ${res}`);
  }
  return res.slice(4);
}
