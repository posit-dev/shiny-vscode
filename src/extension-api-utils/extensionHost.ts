// =============================================================================
// Positron API Utilities
// -----------------------------------------------------------------------------
// This module provides access to Positron-specific APIs. These functions return
// undefined or fallback values when running in VS Code, allowing the extension
// to work in both environments.
// =============================================================================

import type * as positron from "positron";
import * as vscode from "vscode";

type PositronApi = typeof positron;
export type PreviewSource = positron.PreviewSource;
export type PreviewSourceType = positron.PreviewSourceType;

declare global {
  function acquirePositronApi(): PositronApi;
}

export interface HostWebviewPanel extends vscode.Disposable {
  readonly webview: vscode.Webview;
  readonly visible: boolean;
  reveal(viewColumn?: vscode.ViewColumn, preserveFocus?: boolean): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly onDidChangeViewState: vscode.Event<any>;
  readonly onDidDispose: vscode.Event<void>;
}
/**
 * Positron only: Get the preview URL function from Positron's API.
 * Returns undefined in VS Code, triggering fallback to Simple Browser.
 * The PreviewSource parameter enables the stop button in Positron's Viewer pane.
 */
export function getExtensionHostPreview():
  | void
  | ((url: string, source?: PreviewSource) => HostWebviewPanel) {
  const pst = getPositronAPI();
  if (!pst) {
    return;
  }
  return (url: string, source?: PreviewSource) =>
    pst.window.previewUrl(vscode.Uri.parse(url), source);
}

/**
 * Get the PreviewSourceType.Terminal enum value from Positron's API.
 * Returns undefined if not running in Positron or if the enum is not available.
 */
export function getPreviewSourceTypeTerminal(): number | undefined {
  const pst = getPositronAPI();
  if (!pst) {
    return undefined;
  }
  // Access the enum from the Positron API
  const previewSourceType = pst.PreviewSourceType;
  if (previewSourceType?.Terminal !== undefined) {
    return previewSourceType.Terminal;
  }
  return undefined;
}

/**
 * Positron only: Get the preferred runtime for a language from Positron's API.
 * Used to find R interpreter path in Positron. Returns undefined in VS Code.
 */
export async function getPositronPreferredRuntime(
  languageId: string
): Promise<positron.LanguageRuntimeMetadata | undefined> {
  const pst = getPositronAPI();
  if (!pst) {
    return;
  }
  return await pst.runtime.getPreferredRuntime(languageId);
}

function getPositronAPI(): undefined | PositronApi {
  if (typeof globalThis?.acquirePositronApi !== "function") {
    return;
  }

  return globalThis.acquirePositronApi();
}

/** Check if we're running in Positron (vs VS Code). */
export function isPositron(): boolean {
  return getPositronAPI() !== undefined;
}

/** Get the name of the current IDE: "Positron" or "VS Code". */
export function getIdeName() {
  if (isPositron()) {
    return "Positron";
  } else {
    return "VS Code";
  }
}
