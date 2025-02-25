import * as vscode from "vscode";
import {
  langInfo,
  type LangFileExt,
  type LangName,
  type LangProperName,
} from "./language";
import { createPromiseWithStatus, type PromiseWithStatus } from "./utils";

class ProjectLanguageState {
  _name: LangName | null = null;
  // This promise resolves when the project language has been set.
  promise: PromiseWithStatus<void> = createPromiseWithStatus<void>();

  // Set the project language to R or Python
  set(name: LangName) {
    this._name = name;
    this.promise.resolve();
  }

  isSet(): boolean {
    return this._name !== null;
  }

  name(): LangName {
    if (this._name === null) {
      throw new Error("Project language has not been set.");
    }
    return this._name;
  }

  properName(): LangProperName {
    return langInfo({ name: this.name() }).properName;
  }

  fileExt(): LangFileExt {
    return langInfo({ name: this.name() }).fileExt;
  }
}

export const projectLanguage = new ProjectLanguageState();

export type SetProjectLanguageParams = {
  language: LangName;
};

export class SetProjectLanguageTool
  implements vscode.LanguageModelTool<SetProjectLanguageParams>
{
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<SetProjectLanguageParams>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const params = options.input;
    projectLanguage.set(params.language);
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(
        `The project language has been set to ${params.language}`
      ),
    ]);
  }
}
