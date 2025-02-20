import * as vscode from "vscode";
import { runShellCommand } from "../extension-api-utils/runShellCommand";
import { getRBinPath, getSelectedPythonInterpreter } from "../run";
import {
  projectLanguage,
  type SetProjectLanguageParams,
} from "./project-language";

export const tools: Array<Tool<unknown>> = [];

// This type is a union of the LanguageModelTool (contains implementation) and
// LanguageModelChatTool (contains metadata) interfaces, so that the
// implementation and metadata for the tool can be defined in a single object.
type Tool<T> = vscode.LanguageModelTool<T> & vscode.LanguageModelChatTool;

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
        description: "Programming language to be used",
      },
    },
    required: ["language"],
    additionalProperties: false,
  },
  invoke: (
    options: vscode.LanguageModelToolInvocationOptions<SetProjectLanguageParams>,
    token: vscode.CancellationToken
  ): vscode.LanguageModelToolResult => {
    const params = options.input;
    projectLanguage.setValue(params.language);
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(
        `The project language has been set to ${params.language}`
      ),
    ]);
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
    options: vscode.LanguageModelToolInvocationOptions<CheckPackageVersionParams>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> => {
    const params = options.input;

    let langRuntimePath: string | false;
    let args: string[] = [];

    let resultString = "";

    if (params.language === "r") {
      langRuntimePath = await getRBinPath("Rscript");
      if (!langRuntimePath) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(
            "Could not find R runtime. It seems to not be installed."
          ),
        ]);
      }

      const versionCheckCode = `
cat("Language: ${params.language}\\nPackage: ${params.package}\\n")
if (system.file(package = "${params.package}") == "") {
  cat("Version: not installed\\n")
} else {
  version <- packageVersion("${params.package}")
  cat("Version:", as.character(version), "\\n")
  cat("Is greater or equal to min version (${params.minVersion}):", version >= "${params.minVersion}", "\\n")
}
`;
      args = ["-e", versionCheckCode];
    } else if (params.language === "python") {
      langRuntimePath = await getSelectedPythonInterpreter();
      if (!langRuntimePath) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart("No Python interpreter selected"),
        ]);
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

print("Language: ${params.language}\\nPackage: ${params.package}")

try:
  from importlib.metadata import version
  import ${params.package}
  ver = version("${params.package}")
  print("Version:", ver)
  print("Is greater or equal to min version (${params.minVersion}):", version_ge(ver, "${params.minVersion}"))
except ImportError:
  print("Version: not installed")
`;
      args = ["-c", versionCheckCode];
    } else {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `Invalid language: ${params.language}`
        ),
      ]);
    }

    const cmdResult = await runShellCommand({
      cmd: langRuntimePath,
      args: args,
    });

    if (cmdResult.status === "error") {
      resultString = `Error getting version of ${params.package}.`;
    } else {
      resultString = cmdResult.stdout.join("");
    }

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(resultString),
    ]);
  },
});
