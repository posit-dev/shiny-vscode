import type * as vscode from "vscode";
import { isShinyAppFilename, type ShinyAppLanguage } from "./app-filename";

const SHINY_APP_LANGUAGES: ShinyAppLanguage[] = ["python", "r"];

/**
 * Delay before re-detecting a document after an edit, so that we don't scan
 * the document for "shiny" on every keystroke.
 */
const DETECT_ON_CHANGE_DELAY = 500;

/** The parts of the VS Code API that app detection uses. */
export interface AppDetectionHost {
  workspace: Pick<
    typeof vscode.workspace,
    | "textDocuments"
    | "onDidOpenTextDocument"
    | "onDidChangeTextDocument"
    | "onDidCloseTextDocument"
  >;
  /** Set a context key. */
  setContext(key: string, value: vscode.Uri[]): void;
}

/**
 * Detect Shiny apps in open documents and keep the app resource context keys
 * up to date.
 *
 * `shiny.<language>.appResources` holds the URIs of open documents detected
 * as Shiny apps in that language. Menus check the `resource` context key
 * against these lists rather than reading a single value for the active
 * editor, so that each editor's run app actions reflect its own document,
 * even when another editor is focused.
 *
 * @param detectLaterDelay Milliseconds to wait after an edit before
 * re-detecting the document.
 */
export function activateAppDetection(
  context: Pick<vscode.ExtensionContext, "subscriptions">,
  { workspace, setContext }: AppDetectionHost,
  detectLaterDelay = DETECT_ON_CHANGE_DELAY
): void {
  /** Detected Shiny app by document URI string. */
  const appByUri = new Map<
    string,
    { uri: vscode.Uri; language: ShinyAppLanguage }
  >();

  /** Pending delayed detection by document URI string. */
  const timeoutByUri = new Map<string, NodeJS.Timeout>();

  /** Set the app resource context keys. */
  const setAppResourceContexts = (): void => {
    // Pass Uri objects, not strings: on web and remote hosts the extension
    // host sees file: URIs while the editor's `resource` key is
    // vscode-remote:, and only Uri objects are transformed to match before
    // the workbench stringifies them.
    const apps = [...appByUri.values()];
    for (const language of SHINY_APP_LANGUAGES) {
      const uris = apps
        .filter((app) => app.language === language)
        .map((app) => app.uri);
      setContext(`shiny.${language}.appResources`, uris);
    }
  };

  /** Detect whether a document is a Shiny app, and track or untrack it. */
  const detect = (document: vscode.TextDocument): void => {
    const uri = document.uri.toString();
    const language = getShinyAppLanguage(document);

    if (language === appByUri.get(uri)?.language) {
      return;
    }
    if (language) {
      appByUri.set(uri, { uri: document.uri, language });
    } else {
      appByUri.delete(uri);
    }
    setAppResourceContexts();
  };

  /**
   * Detect a document after a delay, restarting the delay on each call, so
   * that a burst of edits is scanned once.
   */
  const detectLater = (document: vscode.TextDocument): void => {
    const uri = document.uri.toString();
    clearTimeout(timeoutByUri.get(uri));
    timeoutByUri.set(
      uri,
      setTimeout(() => {
        timeoutByUri.delete(uri);
        detect(document);
      }, detectLaterDelay)
    );
  };

  /** Stop tracking a closed document. */
  const forget = (document: vscode.TextDocument): void => {
    const uri = document.uri.toString();
    clearTimeout(timeoutByUri.get(uri));
    timeoutByUri.delete(uri);
    if (appByUri.delete(uri)) {
      setAppResourceContexts();
    }
  };

  // Detect apps in documents that are already open. Set the context keys even
  // if there are none, to clear values left by a previous extension host.
  workspace.textDocuments.forEach(detect);
  setAppResourceContexts();

  context.subscriptions.push(
    workspace.onDidOpenTextDocument(detect),
    workspace.onDidChangeTextDocument((event) => {
      // Skip events that only change the dirty state.
      if (event.contentChanges.length > 0) {
        detectLater(event.document);
      }
    }),
    workspace.onDidCloseTextDocument(forget),
    { dispose: () => timeoutByUri.forEach((timeout) => clearTimeout(timeout)) }
  );
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
    // Only files on disk can be run. This excludes untitled documents and
    // read-only views such as git revisions.
    document.uri.scheme === "file" &&
    isShinyAppFilename(document.fileName, language) &&
    document.getText().search(/\bshiny\b/) >= 0
  ) {
    return language;
  }
  return undefined;
}
