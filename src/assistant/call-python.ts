import * as vscode from "vscode";
import {
  runShellCommandWithTerminalOutput,
  type TerminalWithMyPty,
} from "../extension-api-utils/run-command-terminal-output";
import { getSelectedPythonInterpreter } from "../run";
import type { RunCommandWithTerminalResult } from "./call-types";
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
export async function callPythonFunction(
  functionName: string,
  args: Readonly<Array<JSONifiable>>,
  kwArgs: Readonly<Record<string, JSONifiable>>,
  opts: {
    env: Readonly<Record<string, string>>;
    imports?: string[];
    terminal?: TerminalWithMyPty;
    newTerminalName: string;
  }
): Promise<RunCommandWithTerminalResult> {
  const langRuntimePath = await getSelectedPythonInterpreter();
  if (!langRuntimePath) {
    return {
      cmdResult: {
        status: "error",
        stdout: [],
        stderr: [],
        errorMsgs: "No Python interpreter selected.",
      },
      terminal: opts.terminal,
      resultString: "No Python interpreter selected.",
    };
  }
  const pyCode: string[] = [];

  for (const import_ of opts.imports ?? []) {
    pyCode.push(`import ${import_}`);
  }
  pyCode.push("_cmdargs = tools.parse_arg_json()");
  pyCode.push(
    `_res = ${functionName}(*_cmdargs["args"], **_cmdargs["kwArgs"])`
  );
  pyCode.push("import json");
  pyCode.push(`print(json.dumps(_res, indent=2))`);

  const pythonBinArgs = [
    "-c",
    pyCode.join("\n"),
    // Pass in the JSON representation of namedArgs as a command line argument
    // which will be picked up by sys.argv() in Python, and will end up in the
    // variable `_cmdargs`.
    JSON.stringify({ args: args, kwArgs: kwArgs }),
  ];

  let resultString = "";
  const appendToResultString = (s: string) => {
    resultString += s;
  };

  const res = await runShellCommandWithTerminalOutput({
    cmd: langRuntimePath,
    args: pythonBinArgs,
    cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    env: opts.env,
    terminal: opts.terminal,
    newTerminalName: opts.newTerminalName,
    stdout: appendToResultString,
    stderr: appendToResultString,
  });
  // Store terminal for future calls
  opts.terminal = res.terminal;

  if (res.cmdResult.status === "error") {
    resultString += `\nError running Python function.`;
  }

  return {
    cmdResult: res.cmdResult,
    terminal: res.terminal,
    resultString,
  };
}

/**
 * Converts a JavaScript/TypeScript value into a string of Python code, which,
 * when evaluated, returns a Python representation of the original JSONifiable
 * input.
 *
 * @param x - The value to convert. Can be a string, number, boolean, null,
 * array, or object.
 * @returns A string representation of the value that can be evaluated in
 * Python.
 * @throws {Error} If the input type is not supported (e.g., undefined or
 * function).
 */
export function toPythonString(x: JSONifiable): string {
  if (typeof x === "string" || typeof x === "number") {
    return JSON.stringify(x);
  } else if (typeof x === "boolean") {
    return x ? "True" : "False";
  } else if (x === null) {
    return "None";
  } else if (Array.isArray(x)) {
    return `[${x.map(toPythonString).join(", ")}]`;
  } else if (typeof x === "object") {
    return `{${Object.entries(x)
      .map(([k, v]) => `${JSON.stringify(k)}: ${toPythonString(v)}`)
      .join(", ")}}`;
  } else {
    throw new Error(`Unsupported type: ${typeof x}`);
  }
}
