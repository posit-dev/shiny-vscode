import type * as positron from "positron";
import * as vscode from "vscode";

type PositronApi = typeof positron;

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
  | ((url: string) => HostWebviewPanel) {
  const pst = getPositronAPI();
  if (!pst) {
    return;
  }
  return (url: string) => pst.window.previewUrl(vscode.Uri.parse(url));
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
