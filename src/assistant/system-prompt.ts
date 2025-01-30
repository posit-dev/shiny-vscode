import * as fs from "fs/promises";
import * as path from "path";
import type * as vscode from "vscode";
import { type ProjectLanguageGuess } from "./language";

// The system prompt directory relative to the extension
const SYSTEM_PROMPT_DIR = "assistant-prompts";

interface PromptVariables {
  language: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  language_specific_prompt: string;
  verbosity: string;
}

async function loadLanguageSpecificPrompt(
  context: vscode.ExtensionContext,
  language: "r" | "python"
): Promise<string> {
  try {
    const promptPath = path.join(
      context.extensionPath,
      SYSTEM_PROMPT_DIR,
      `app_prompt_${language.toLowerCase()}.md`
    );
    return await fs.readFile(promptPath, "utf8");
  } catch (error) {
    console.error(`Failed to load ${language}-specific prompt:`, error);
    return "Be very concise in the text.";
  }
}

export async function loadSystemPrompt(
  context: vscode.ExtensionContext
): Promise<string> {
  try {
    const promptPath = path.join(
      context.extensionPath,
      SYSTEM_PROMPT_DIR,
      "app_prompt.md"
    );
    const promptTemplate = await fs.readFile(promptPath, "utf8");

    // Default to Python for now
    const language = "python";

    // Load language-specific prompt
    const languageSpecificPrompt = await loadLanguageSpecificPrompt(
      context,
      language
    );

    // Substitute variables
    const variables: PromptVariables = {
      language,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      language_specific_prompt: languageSpecificPrompt,
      verbosity: "Be very concise in the text.",
    };

    return substituteVariables(promptTemplate, variables);
  } catch (error) {
    console.error("Failed to load system prompt:", error);
    // TODO: Use different default prompt
    return "";
  }
}

function substituteVariables(
  template: string,
  variables: PromptVariables
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return variables[key as keyof PromptVariables] || match;
  });
}
