import * as vscode from "vscode";
import { isShinyAppFilename } from "./extension";

type ShinyAppLanguage = "python" | "r";

const SHINY_APP_LANGUAGES: ShinyAppLanguage[] = ["python", "r"];

/**
 * Delay before re-detecting a document after an edit, so that we don't scan
 * the document for "shiny" on every keystroke.
 */
const DETECT_ON_CHANGE_DELAY = 500;

/** Detected Shiny app language by document URI, for open documents that are Shiny apps. */
const languageByUri = new Map<string, ShinyAppLanguage>();

/**
 * Detect Shiny apps in open documents and keep the app resource context keys
 * up to date.
 *
 * `shiny.<language>.appResources` holds the URIs of open documents detected
 * as Shiny apps in that language. Menus check the `resource` context key
 * against these lists rather than reading a single value for the active
 * editor, so that each editor's run app actions reflect its own document,
 * even when another editor is focused.
 */
export function activateAppDetection(context: vscode.ExtensionContext): void {
  const timeoutByUri = new Map<string, NodeJS.Timeout>();

  // Detect apps in documents that are already open.
  vscode.workspace.textDocuments.forEach(detectShinyApp);
  updateAppResourceContexts();

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(detectShinyApp),

    // Throttle updates while the user is typing.
    vscode.workspace.onDidChangeTextDocument((event) => {
      const uri = event.document.uri.toString();
      clearTimeout(timeoutByUri.get(uri));
      timeoutByUri.set(
        uri,
        setTimeout(() => {
          timeoutByUri.delete(uri);
          detectShinyApp(event.document);
        }, DETECT_ON_CHANGE_DELAY)
      );
    }),

    vscode.workspace.onDidCloseTextDocument((document) => {
      const uri = document.uri.toString();
      clearTimeout(timeoutByUri.get(uri));
      timeoutByUri.delete(uri);
      forgetShinyApp(document);
    }),

    { dispose: () => timeoutByUri.forEach((timeout) => clearTimeout(timeout)) }
  );
}

/** Detect whether a document is a Shiny app, and update the app resource context keys. */
export function detectShinyApp(document: vscode.TextDocument): void {
  const uri = document.uri.toString();
  const language = getShinyAppLanguage(document);

  if (language === languageByUri.get(uri)) {
    return;
  }
  if (language) {
    languageByUri.set(uri, language);
  } else {
    languageByUri.delete(uri);
  }
  updateAppResourceContexts();
}

/** Stop tracking a closed document, and update the app resource context keys. */
export function forgetShinyApp(document: vscode.TextDocument): void {
  if (languageByUri.delete(document.uri.toString())) {
    updateAppResourceContexts();
  }
}

/** Get the language of a document if it is a Shiny app. */
function getShinyAppLanguage(
  document: vscode.TextDocument
): ShinyAppLanguage | undefined {
  const language = SHINY_APP_LANGUAGES.find(
    (language) => language === document.languageId
  );
  if (
    language &&
    !document.isUntitled &&
    !!document.fileName &&
    isShinyAppFilename(document.fileName, language) &&
    document.getText().search(/\bshiny\b/) >= 0
  ) {
    return language;
  }
  return undefined;
}

function updateAppResourceContexts(): void {
  for (const language of SHINY_APP_LANGUAGES) {
    const uris = Array.from(languageByUri)
      .filter(([, appLanguage]) => appLanguage === language)
      .map(([uri]) => uri);
    vscode.commands.executeCommand(
      "setContext",
      `shiny.${language}.appResources`,
      uris
    );
  }
}
