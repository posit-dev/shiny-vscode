import * as vscode from "vscode";
import { runShellCommand } from "../extension-api-utils/runShellCommand";
import { getRBinPath, getSelectedPythonInterpreter } from "../run";
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
    cancellationToken: vscode.CancellationToken
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
    token: vscode.CancellationToken
  ): string => {
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
    token: vscode.CancellationToken
  ): Promise<string> => {
    let langRuntimePath: string | false;
    let args: string[] = [];

    let resultString = "";

    if (language === "r") {
      langRuntimePath = await getRBinPath("Rscript");
      if (!langRuntimePath) {
        return "Could not find R runtime. It seems to not be installed.";
      }

      const versionCheckCode = `
cat("Language: ${language}\\nPackage: ${package_}\\n")
if (system.file(package = "${package_}") == "") {
  cat("Version: not installed\\n")
} else {
  version <- packageVersion("${package_}")
  cat("Version:", as.character(version), "\\n")
  cat("Is greater or equal to min version (${minVersion}):", version >= "${minVersion}", "\\n")
}
`;
      args = ["-e", versionCheckCode];
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

print("Language: ${language}\\nPackage: ${package_}")

try:
  from importlib.metadata import version
  import ${package_}
  ver = version("${package_}")
  print("Version:", ver)
  print("Is greater or equal to min version (${minVersion}):", version_ge(ver, "${minVersion}"))
except ImportError:
  print("Version: not installed")
`;
      args = ["-c", versionCheckCode];
    } else {
      return `Invalid language: ${language}`;
    }

    const cmdResult = await runShellCommand({
      cmd: langRuntimePath,
      args: args,
    });

    if (cmdResult.status === "error") {
      resultString = `Error getting version of ${package_}.`;
    } else {
      resultString = cmdResult.stdout.join("");
    }

    return resultString;
  },
});
