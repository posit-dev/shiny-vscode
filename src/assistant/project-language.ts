import * as vscode from "vscode";
import { createPromiseWithStatus, type PromiseWithStatus } from "./utils";

class ProjectLanguageState {
  _value: "r" | "python" | null = null;
  // This promise resolves when the project language has been set.
  promise: PromiseWithStatus<void> = createPromiseWithStatus<void>();

  value(): "r" | "python" | null {
    return this._value;
  }

  // Set the project language to R or Python
  setValue(value: "r" | "python") {
    this._value = value;
    this.promise.resolve();
  }
}

export const projectLanguage = new ProjectLanguageState();

type SetProjectLanguageParams = {
  language: "r" | "python";
};

export class SetProjectLanguageTool
  implements vscode.LanguageModelTool<SetProjectLanguageParams>
{
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<SetProjectLanguageParams>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const params = options.input;
    projectLanguage.setValue(params.language);
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(
        `The project language has been set to ${params.language}`
      ),
    ]);
  }
}
