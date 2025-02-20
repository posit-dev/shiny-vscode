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

interface LanguageParams {
  language: "r" | "python";
}

tools.push({
  name: "shiny-checkVersionTool",
  description:
    "Get the version of Shiny that is installed on the user's system.",
  inputSchema: {
    type: "object",
    properties: {
      language: {
        type: "string",
        enum: ["r", "python"],
        description: "Programming language that Shiny is being used with",
      },
    },
    additionalProperties: false,
  },
  invoke: async (
    options: vscode.LanguageModelToolInvocationOptions<LanguageParams>,
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
if (system.file(package = "shiny") == "") {
  cat("not installed")
} else {
  cat(as.character(packageVersion("shiny")))
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

      const versionCheckCode = `
try:
  import shiny
except ImportError:
  print('not installed')
print(shiny.__version__)
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
      resultString = `Error getting Shiny version.`;
    } else {
      resultString = `Shiny for ${params.language} version: ${cmdResult.stdout.join("")}`;
    }

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(resultString),
    ]);
  },
});
