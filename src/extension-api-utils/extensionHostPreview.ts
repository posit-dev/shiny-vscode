import * as vscode from "vscode";

declare const globalThis: {
    [key: string]: any;
};

export interface HostWebviewPanel extends vscode.Disposable {
    readonly webview: vscode.Webview;
    readonly visible: boolean;
    reveal(viewColumn?: vscode.ViewColumn, preserveFocus?: boolean): void;
    readonly onDidChangeViewState: vscode.Event<any>;
    readonly onDidDispose: vscode.Event<void>;
}

export function getExtensionHostPreview(): void | ((url: string) => HostWebviewPanel) {
    if (
        "acquirePositronApi" in globalThis &&
        typeof globalThis.acquirePositronApi === "function"
    ) {
        const pst = globalThis.acquirePositronApi();
        if (!pst) { return; }
        return (url: string) => pst.window.previewUrl(vscode.Uri.parse(url));
    }
}
