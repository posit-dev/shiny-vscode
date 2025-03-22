import type * as vscode from "vscode";
import { isPositron } from "../extension-api-utils/extensionHost";

export function checkUsingDesiredModel(model: vscode.LanguageModelChat) {
  if (isPositron()) {
    if (model.name.match(/claude 3.\d sonnet/i)) {
      return true;
    }
  } else {
    // We're in VS Code (are there any other VS Code forks that implement the
    // chat APIs?)
    if (model.name.match(/claude 3.5 sonnet/i)) {
      return true;
    }
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
    if (modelName.match(/claude 3.7 sonnet/i)) {
      stream.markdown(
        "**Claude 3.7 Sonnet** currently doesn't work with chat participants like `@shiny`.\n\n"
      );
    } else {
      stream.markdown(
        `For best results with \`@shiny\`, please switch to **${desiredModelName()}**.\n\n`
      );
    }
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
    return "Claude 3.7 Sonnet";
  } else {
    return "Claude 3.5 Sonnet";
  }
}
