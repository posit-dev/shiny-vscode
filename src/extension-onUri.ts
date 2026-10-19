import * as vscode from "vscode";
import {
  shinyliveSaveAppFromUrl,
  shinyliveUrlDecode,
  shinyliveUrlEncode,
} from "./shinylive";

export async function handlePositShinyUri(uri: vscode.Uri): Promise<void> {
  if (!["/shinylive", "/shinylive/"].includes(uri.path)) {
    console.warn(`[shiny] Unexpected URI: ${uri.toString()}`);
    return;
  }

  // VS Code has already percent-decoded the query. Keep everything after
  // `url=`, including embedded &, +, and %, rather than parsing it as form data.
  let url = uri.query.match(/(?:^|&)url=(.*)/s)?.[1];

  if (!url) {
    vscode.window.showErrorMessage(
      "No URL provided in the Open from Shinylive link."
    );
    return;
  }

  // Links built with searchParams.set("url", encodeURIComponent(url)) are
  // double-encoded. Decode the remaining layer only if no URL scheme is present;
  // already-decoded URLs may contain literal percent signs that must be kept.
  if (!/^[a-z][a-z\d+.-]*:/i.test(url)) {
    try {
      url = decodeURIComponent(url);
    } catch {
      // Leave malformed encoding for the URL decoder to reject below.
    }
  }

  const bundle = shinyliveUrlDecode(url);

  if (!bundle) {
    vscode.window.showErrorMessage(
      "Shinylive: Failed to parse the Shinylive link. " +
        "Please check the link and try again."
    );
    return;
  }

  let filesText = bundle.files
    .slice(0, 3)
    .map((f) => f.name)
    .join(", ");
  if (bundle.files.length > 3) {
    filesText += `, and ${bundle.files.length - 3} more files`;
  }

  const reviewAction = await vscode.window.showWarningMessage(
    `You are about to save a Shinylive app with ${filesText} to your workspace. Would you like to...`,
    { modal: true },
    { title: "Review the app on shinylive.io", action: "review" },
    {
      title: `Save app ${bundle.files.length === 1 ? "file" : "files"} locally`,
      action: "save",
    }
  );

  let { action } = reviewAction || { action: "cancel" };

  if (action === "cancel") {
    return;
  }

  if (action === "review") {
    bundle.mode = "editor";
    const editorUrl = shinyliveUrlEncode(bundle);
    vscode.env.openExternal(vscode.Uri.parse(editorUrl));

    const openAfterReview = await vscode.window.showInformationMessage(
      "After reviewing the Shinylive app, would you like to save it?",
      { modal: true },
      "Yes"
    );

    if (!openAfterReview) {
      return;
    }
    action = "save";
  }

  if (action === "save") {
    await shinyliveSaveAppFromUrl(url);
    return;
  }
}
