import * as vscode from "vscode";

declare const globalThis: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

export interface HostWebviewPanel extends vscode.Disposable {
  readonly webview: vscode.Webview;
  readonly visible: boolean;
  reveal(viewColumn?: vscode.ViewColumn, preserveFocus?: boolean): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly onDidChangeViewState: vscode.Event<any>;
  readonly onDidDispose: vscode.Event<void>;
}

type LanguageRuntimeMetadata = Partial<{
  // https://github.com/posit-dev/positron/blob/39a01b71/src/positron-dts/positron.d.ts#L357
  /** The path to the runtime. */
  runtimePath: string;

  /**
   * The fully qualified name of the runtime displayed to the user; e.g. "R 4.2 (64-bit)".
   * Should be unique across languages.
   */
  runtimeName: string;

  /**
   * A language specific runtime name displayed to the user; e.g. "4.2 (64-bit)".
   * Should be unique within a single language.
   */
  runtimeShortName: string;

  /** The version of the runtime itself (e.g. kernel or extension version) as a string; e.g. "0.1" */
  runtimeVersion: string;
}>;

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
): Promise<LanguageRuntimeMetadata | undefined> {
  const pst = getPositronAPI();
  if (!pst) {
    return;
  }
  return await pst.runtime.getPreferredRuntime(languageId);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPositronAPI(): undefined | any {
  if (typeof globalThis?.acquirePositronApi !== "function") {
    return;
  }

  return globalThis.acquirePositronApi();
}
