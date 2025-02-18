import * as vscode from "vscode";
import {
  projectLanguage,
  type SetProjectLanguageParams,
} from "./project-language";

export const tools: Array<Tool<unknown>> = [];

type Tool<T> = vscode.LanguageModelTool<T> & vscode.LanguageModelChatTool;

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
