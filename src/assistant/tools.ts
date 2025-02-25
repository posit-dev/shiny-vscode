import * as vscode from "vscode";
import { runShellCommandWithTerminalOutput } from "../extension-api-utils/run-command-terminal-output";
import { getRBinPath, getSelectedPythonInterpreter } from "../run";
import {
  projectLanguage,
  type SetProjectLanguageParams,
} from "./project-language";
import type { JSONifiable } from "./types";
import { capitalizeFirst } from "./utils";

// TODO: Fix types so that we can get rid of the `any`, because it disables
// type checking for the `params` argument of all `invoke()` methods -- they
// could be a non-Record type, which contradicts the type definition of Tool.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const tools: Array<Tool<any>> = [];

type InvokeOptions = {
  stream: vscode.ChatResponseStream;
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
    opts.stream.markdown(`\n\nSetting project language to ${language}.\n\n`);
    projectLanguage.setValue(language);
    return `The project language has been set to ${language}`;
  },
});

interface CheckPackageVersionParams {
  language: "r" | "python";
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
      `\n\nChecking version of ${package_} for ${capitalizeFirst(language)}...\n\n`
    );
    let langRuntimePath: string | false;
    let args: string[] = [];

    if (minVersion === undefined) {
      minVersion = "";
    }

    if (language === "r") {
      langRuntimePath = await getRBinPath("Rscript");
      if (!langRuntimePath) {
        return "Could not find R runtime. It seems to not be installed.";
      }

      // TODO: Replace this with proper JSON output
      const versionCheckCode = `
if (system.file(package = "${package_}") == "") {
  version <- "null"
  at_least_min_version <- "null"
} else {
  version <- packageVersion("${package_}")
  if ("${minVersion}" != "") {
    at_least_min_version <- version >= "${minVersion}"
  } else {
    at_least_min_version <- "null"
  }
}

cat(
  sep = "",
  '{
  "language": "${language}",
  "package": "${package_}",
  "version": "' , as.character(version), '",
  "min_version": "${minVersion}",
  "at_least_min_version": "', as.character(at_least_min_version), '"
}')`;
      args = ["-e", versionCheckCode];

      //
    } else if (language === "python") {
      langRuntimePath = await getSelectedPythonInterpreter();
      if (!langRuntimePath) {
        return "No Python interpreter selected";
      }

      // Python code to check that a version number is greater or equal to
      // another. It would be nicer to use packaging.version, but that's not
      // part of the standard library.
      // Test cases for version_ge():
      //   assert not version_ge("0.dev16+g83", "0.0.1")
      //   assert not version_ge("0.3.dev16+g83", "0.3.1")
      //   assert version_ge("0.3.1.dev16+g83", "0.3.1")
      //   assert not version_ge("0.3.1", "0.3.1.dev16+g83")
      //   assert not version_ge("0.3.1.dev16+g83", "0.3.2")
      //   assert version_ge("0.3.1.dev16+g83", "0.3.1.dev15")
      //   assert version_ge("0.3.1.dev15+g83", "0.3.1.dev15")
      //   assert not version_ge("0.3.1.dev15+g83", "0.3.1.dev16")
      //   assert version_ge("0.3.1dev16", "0.3.1")
      //   assert version_ge("0.3.1.dev16", "0.3.1")
      //   assert not version_ge("0.3.dev16+g83", "0.3.1")
      //   assert not version_ge("0.3.0dev16", "0.3.1")
      const versionCheckCode = `
def version_ge(version1: str, version2: str):
  # First drop everything after '+'
  version1 = version1.split("+")[0]
  version2 = version2.split("+")[0]

  def split_version(v: str) -> list[str]:
    # First split on '.dev'
    v = v.replace(".dev", ".").replace("dev", ".")
    parts = v.split(".")
    return parts

  parts1 = [int(x) for x in split_version(version1)]
  parts2 = [int(x) for x in split_version(version2)]

  max_length = max(len(parts1), len(parts2))
  parts1 += [0] * (max_length - len(parts1))
  parts2 += [0] * (max_length - len(parts2))

  for part1, part2 in zip(parts1, parts2):
    if part1 > part2:
      return True
    elif part1 < part2:
      return False

  return True

try:
  import json
  from importlib.metadata import version
  import ${package_}
  ver = version("${package_}")
  if "${minVersion}" == "":
    at_least_min_version = None
  else:
    at_least_min_version = version_ge(ver, "${minVersion}")
except ImportError:
  ver = None
  at_least_min_version = None

print(json.dumps({
  "language": "${language}",
  "package": "${package_}",
  "version": ver,
  "min_version": "${minVersion}",
  "at_least_min_version": at_least_min_version
}, indent=2))
`;
      args = ["-c", versionCheckCode];
    } else {
      return `Invalid language: ${language}`;
    }

    let resultString = "";
    const appendToResultString = (s: string) => {
      resultString += s;
    };

    const cmdResult = await runShellCommandWithTerminalOutput({
      cmd: langRuntimePath,
      args: args,
      terminalName: "Shiny Assistant tool call",
      cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      stdout: appendToResultString,
      stderr: appendToResultString,
    });

    if (cmdResult.status === "error") {
      resultString += `\nError getting version of ${package_}.`;
    }

    // opts.stream.markdown(resultString);

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
    { language }: { language: "r" | "python" },
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

    const cmdResult = await runShellCommandWithTerminalOutput({
      cmd: langRuntimePath,
      args: args,
      cwd: workspaceDir,
      terminalName: "Shiny Assistant tool call",
      timeoutMs: 15000,
      stdout: (s: string) => {
        resultString += s;
      },
      stderr: (s: string) => {
        resultString += s;
      },
    });

    if (cmdResult.status === "error") {
      resultString += `Error installing packages.`;
    }

    return resultString;
  },
});
