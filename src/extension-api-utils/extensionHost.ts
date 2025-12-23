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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const previewSourceType = (pst as any).PreviewSourceType;
  if (previewSourceType?.Terminal !== undefined) {
    return previewSourceType.Terminal;
  }
  return undefined;
}

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

export function isPositron(): boolean {
  return getPositronAPI() !== undefined;
}

export function getIdeName() {
  if (isPositron()) {
    return "Positron";
  } else {
    return "VS Code";
  }
}
