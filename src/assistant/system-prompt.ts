/* eslint-disable @typescript-eslint/naming-convention */

import * as path from "path";
import * as Sqrl from "squirrelly";
import type * as vscode from "vscode";
import { type ProjectSettings } from "./extension";
import { langNameToFileExt, langNameToProperName } from "./language";

// The system prompt directory relative to the extension
const SYSTEM_PROMPT_SUBDIR = "assistant-prompts";

interface PromptVariables {
  language: string;
  project_settings: string;
  language_specific_prompt: string;
  verbosity: string;
}

export async function loadSystemPrompt(
  context: vscode.ExtensionContext,
  projectSettings: ProjectSettings
): Promise<string> {
  try {
    if (!projectSettings.language) {
      throw new Error("Project language not set");
    }

    const promptDir = path.join(context.extensionPath, SYSTEM_PROMPT_SUBDIR);

    const mainPromptPath = path.join(promptDir, "main.md");

    const result = await Sqrl.renderFile(mainPromptPath, {
      autoEscape: false,
      language: langNameToProperName(projectSettings.language),
      fileExt: langNameToFileExt(projectSettings.language),
      projectSettings: JSON.stringify(projectSettings, null, 2),
      verbosity: "Be very concise in the text.",
    });
    return result;
  } catch (error) {
    console.error("Failed to load system prompt:", error);
    return "";
  }
}
