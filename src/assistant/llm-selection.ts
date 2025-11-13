import type * as vscode from "vscode";

/**
 * Returns the list of model names we accept (won't show warning for).
 * Includes both orderings ("Sonnet 4" and "4 Sonnet") to handle variations
 * across different platforms and versions.
 */
function getAcceptedModelNames(): string[] {
  return [
    "Claude Sonnet 4.5",
    "Claude 4.5 Sonnet",
    "Claude Haiku 4.5",
    "Claude 4.5 Haiku",
    "Claude Sonnet 4",
    "Claude 4 Sonnet",
    "Claude Haiku 4",
    "Claude 4 Haiku",
  ];
}

/**
 * Returns the list of model names we suggest to users.
 * Always uses "Sonnet 4" ordering.
 */
function getSuggestedModelNames(): string[] {
  return ["Claude Sonnet 4.5", "Claude Haiku 4.5"];
}

export function checkUsingDesiredModel(model: vscode.LanguageModelChat) {
  const acceptedModels = getAcceptedModelNames();
  return acceptedModels.some(
    (acceptedModel) =>
      model.name.toLowerCase() === acceptedModel.toLowerCase()
  );
}

export function displayDesiredModelSuggestion(
  modelName: string,
  stream: vscode.ChatResponseStream
) {
  const suggestedModels = getSuggestedModelNames();
  const suggestionText = suggestedModels.join(" or ");

  // The text displays much more quickly if we call markdown() twice instead
  // of just once.
  stream.markdown(
    `It looks like you are using **${modelName}** for Copilot. `
  );
  stream.markdown(
    `For best results with \`@shiny\`, please switch to **${suggestionText}**.\n\n`
  );

  stream.button({
    title: `I'll switch to a recommended model`,
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
  const suggestedModels = getSuggestedModelNames();
  return suggestedModels.join(" or ");
}
