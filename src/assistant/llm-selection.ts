import type * as vscode from "vscode";
import { isPositron } from "../extension-api-utils/extensionHost";

export function checkUsingDesiredModel(model: vscode.LanguageModelChat) {
  // In older versions of VS Code, the model names were like "Claude 3.5
  // Sonnet", but in newer versions, they are like "Claude Sonnet 3.5".
  // In Positron as of this writing, the model names are like "Claude 3.5
  // Sonnet".
  if (model.name.match(/claude .*sonnet/i)) {
    return true;
  }

  return false;
}

export function displayDesiredModelSuggestion(
  modelName: string,
  stream: vscode.ChatResponseStream
) {
  if (isPositron()) {
    // The text displays much more quickly if we call markdown() twice instead
    // of just once.
    stream.markdown(
      `It looks like you are using **${modelName}** for Copilot. `
    );
    stream.markdown(
      `For best results with \`@shiny\`, please switch to **${desiredModelName()}**.\n\n`
    );
  } else {
    // VS Code
    // The text displays much more quickly if we call markdown() twice instead
    // of just once.
    stream.markdown(
      `It looks like you are using **${modelName}** for Copilot. `
    );
    stream.markdown(
      `For best results with \`@shiny\`, please switch to **${desiredModelName()}**.\n\n`
    );
  }

  stream.button({
    title: `I'll switch to ${desiredModelName()}`,
    command: "shiny.assistant.continueAfterDesiredModelSuggestion",
    arguments: [true],
  });
  stream.button({
    title: `No thanks, I'll continue with ${modelName}`,
    command: "shiny.assistant.continueAfterDesiredModelSuggestion",
    arguments: [false],
  });
}

export function desiredModelName() {
  if (isPositron()) {
    return "Claude 4 Sonnet";
  } else {
    return "Claude Sonnet 4";
  }
}
