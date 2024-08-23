import * as vscode from "vscode";
import { URLSearchParams } from "url";
import { shinyliveSaveAppFromUrl } from "./shinylive";

export function handlePositShinyUri(uri: vscode.Uri): void {
  if (!["/shinylive", "/shinylive/"].includes(uri.path)) {
    console.warn(`[shiny] Unexpected URI: ${uri.toString()}`);
    return;
  }

  const encodedUrl = new URLSearchParams(uri.query).get("url");

  if (!encodedUrl) {
    vscode.window.showErrorMessage(
      "No URL provided in the Open from Shinylive link."
    );
    return;
  }

  const decodedUrl = decodeURIComponent(encodedUrl);
  shinyliveSaveAppFromUrl(decodedUrl);
}
