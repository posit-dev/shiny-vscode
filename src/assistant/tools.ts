import * as path from "path";
import * as vscode from "vscode";
import {
  runShellCommandWithTerminalOutput,
  type TerminalWithMyPty,
} from "../extension-api-utils/run-command-terminal-output";
import { getRBinPath, getSelectedPythonInterpreter } from "../run";
import { langNameToProperName, type LangName } from "./language";
import {
  projectLanguage,
  type SetProjectLanguageParams,
} from "./project-language";
import type { JSONifiable } from "./types";

// TODO: Fix types so that we can get rid of the `any`, because it disables
// type checking for the `params` argument of all `invoke()` methods -- they
// could be a non-Record type, which contradicts the type definition of Tool.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const tools: Array<Tool<any>> = [];

export type InvokeOptions = {
  stream: vscode.ChatResponseStream;
  extensionContext: vscode.ExtensionContext;
  newTerminalName: string;
  terminal?: TerminalWithMyPty;
  cancellationToken: vscode.CancellationToken;
};

// This type is a union of the LanguageModelChatTool (contains metadata)
// interface and an invoke method, so that the metadata and implementation for
// the tool can be defined in a single object. The VS Code chat extension API
// usually wants the invoke() implementation in a LanguageModelTool object. Here
// we have a simpler version of LanguageModelTool, in which the `invoke()`
// method can return a JSONifiable value (which will be wrapped later) instead
// of the more complex LanguageModelToolResult.
type Tool<T extends Record<string, unknown>> = vscode.LanguageModelChatTool & {
  invoke: (
    params: T,
    opts: InvokeOptions
  ) => JSONifiable | Promise<JSONifiable>;
};

/**
 * Wraps a tool's invocation result in a VS Code LanguageModelToolResult. If the
 * result is already a LanguageModelToolResult, returns it as is. Otherwise,
 * converts the result to a JSON string and wraps it in a new
 * LanguageModelToolResult.
 *
 * @param result - The result from a tool's invoke method, either a JSONifiable
 * value or a LanguageModelToolResult
 * @returns A LanguageModelToolResult that can be returned to VS Code's language
 * model API
 */
export function wrapToolInvocationResult(
  result: JSONifiable | vscode.LanguageModelToolResult
): vscode.LanguageModelToolResult {
  if (result instanceof vscode.LanguageModelToolResult) {
    return result;
  } else {
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify(result)),
    ]);
  }
}

// This tool will be called when the user asks to set the project language to
// either R or Python.
tools.push({
  name: "shiny-assistant_setProjectLanguageTool",
  description:
    "Set the language of the project to R or Python. Only call this tool if the user specifically asks to set the language.",
  inputSchema: {
    type: "object",
    properties: {
      language: {
        type: "string",
        enum: ["r", "python"],
        description: "Programming language to use for the project",
      },
    },
    required: ["language"],
    additionalProperties: false,
  },
  invoke: (
    { language }: SetProjectLanguageParams,
    opts: InvokeOptions
  ): string => {
    opts.stream.markdown(
      `\n\nSetting project language to ${langNameToProperName(language)}...\n\n`
    );
    projectLanguage.set(language);
    return `The project language has been set to ${langNameToProperName(language)}`;
  },
});

interface CheckPackageVersionParams {
  language: LangName;
  package: string;
  minVersion?: string;
}

tools.push({
  name: "shiny-assistant_checkPackageVersionTool",
  description:
    "Get the version of an R or Python package that is installed on the user's system.",
  inputSchema: {
    type: "object",
    properties: {
      language: {
        type: "string",
        enum: ["r", "python"],
        description: "Programming language that Shiny is being used with",
      },
      package: {
        type: "string",
        description: "Name of package to check the version of",
      },
      minVersion: {
        type: "string",
        description: "Minimum version of the package required",
      },
    },
    required: ["language", "package"],
    additionalProperties: false,
  },
  invoke: async (
    // Note `package` is a reserved keyword so we'll use `package_` instead.
    { language, package: package_, minVersion }: CheckPackageVersionParams,
    opts: InvokeOptions
  ): Promise<string> => {
    opts.stream.markdown(
      `\n\nChecking version of ${package_} for ${langNameToProperName(language)}...\n\n`
    );
    let langRuntimePath: string | false;
    let args: string[] = [];
    const env: Record<string, string> = {};

    if (language === "r") {
      langRuntimePath = await getRBinPath("Rscript");
      if (!langRuntimePath) {
        return "Could not find R runtime. It seems to not be installed.";
      }
      const toolsScriptPath = path.join(
        opts.extensionContext.extensionPath,
        "assistant-prompts",
        "tools.R"
      );
      args = [
        "-e",
        `source("${toolsScriptPath}"); args <- json_parse_args()`,
        "-e",
        "cat(to_json(check_package_version(args$package, args$min_version)))",
        JSON.stringify({
          package: package_,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          min_version: minVersion ?? null,
        }),
      ];
    } else if (language === "python") {
      langRuntimePath = await getSelectedPythonInterpreter();
      if (!langRuntimePath) {
        return "No Python interpreter selected";
      }

      args = [
        "-c",
        `import tools
args = tools.args()
res = tools.check_package_version(args['package'], args['min_version'])
import json
print(json.dumps(res, indent=2))`,
        JSON.stringify({
          package: package_,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          min_version: minVersion ?? null,
        }),
      ];

      env.PYTHONPATH = path.join(
        opts.extensionContext.extensionPath,
        "assistant-prompts"
      );
    } else {
      return `Invalid language: ${language}`;
    }

    let resultString = "";
    const appendToResultString = (s: string) => {
      resultString += s;
    };

    const res = await runShellCommandWithTerminalOutput({
      cmd: langRuntimePath,
      args: args,
      env: env,
      terminal: opts.terminal,
      newTerminalName: opts.newTerminalName,
      cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      stdout: appendToResultString,
      stderr: appendToResultString,
    });
    // Store terminal for future tool calls
    opts.terminal = res.terminal;

    if (res.cmdResult.status === "error") {
      resultString += `\nError getting version of ${package_}.`;
    }

    return resultString;
  },
});

// TODO: Implement for R
tools.push({
  name: "shiny-assistant_installRequiredPackagesTool",
  description: "Installs necessary packages, for Python only.",
  inputSchema: {
    type: "object",
    properties: {
      language: {
        type: "string",
        enum: ["r", "python"],
        description: "Programming language that Shiny is being used with",
      },
    },
    required: ["language"],
    additionalProperties: false,
  },
  invoke: async (
    { language }: { language: LangName },
    opts: InvokeOptions
  ): Promise<string> => {
    let langRuntimePath: string | false;
    let args: string[] = [];

    let resultString = "";

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!(workspaceFolders && workspaceFolders.length > 0)) {
      return "No workspace folder found.";
    }
    const workspaceDir = workspaceFolders[0].uri.fsPath;

    opts.stream.markdown("\n\nInstalling required packages...\n\n");

    if (language === "r") {
      return "Installing R packages is not supported yet.";
    } else if (language === "python") {
      langRuntimePath = await getSelectedPythonInterpreter();
      if (!langRuntimePath) {
        return "No Python interpreter selected";
      }

      args = ["-m", "pip", "install", "-r", "requirements.txt"];
    } else {
      return `Invalid language: ${language}`;
    }

    resultString = `Running command: \n\`\`\`\n${langRuntimePath} ${args.join(" ")}\n\`\`\`\n\n`;
    opts.stream.markdown(resultString);
    opts.stream.progress("Running...");

    const res = await runShellCommandWithTerminalOutput({
      cmd: langRuntimePath,
      args: args,
      cwd: workspaceDir,
      terminal: opts.terminal,
      newTerminalName: opts.newTerminalName,
      timeoutMs: 15000,
      stdout: (s: string) => {
        resultString += s;
      },
      stderr: (s: string) => {
        resultString += s;
      },
    });
    // Store terminal for future tool calls
    opts.terminal = res.terminal;

    if (res.cmdResult.status === "error") {
      resultString += `Error installing packages.`;
    }

    return resultString;
  },
});
