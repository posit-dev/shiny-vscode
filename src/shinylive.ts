import * as vscode from "vscode";
import * as lzstring from "lz-string";
import * as path from "path";

type ShinyliveFile = {
  name: string;
  content: string;
  type: "text" | "binary";
};

type ShinyliveBundle = ShinyliveFile[];

type UserOpenAction = "open" | "copy";
type ShinyliveMode = "app" | "editor";
type ShinyliveLanguage = "r" | "py";

export async function shinyliveCreateFromActiveFile(): Promise<void> {
  if (!vscode.window.activeTextEditor) {
    vscode.window.showErrorMessage("No active file");
    return;
  }

  const content = vscode.window.activeTextEditor.document.getText();
  const { fileName: filePath, languageId: language } =
    vscode.window.activeTextEditor.document;

  if (!language || !["r", "python"].includes(language)) {
    vscode.window.showErrorMessage(
      "Shinylive only supports Python and R apps."
    );
    return;
  }

  const { name: fileName } = path.parse(filePath);

  if (!/(^app|app$)/i.test(fileName)) {
    vscode.window.showErrorMessage(
      "A single-file Shiny app is required when sending the current file to Shinylive."
    );
    return;
  }

  const extension = language === "r" ? "R" : "py";

  const bundle: ShinyliveBundle = [
    {
      name: `app.${extension}`,
      content,
      type: "text",
    },
  ];

  const mode = await askUserForMode();
  const url = shinyliveUrlEncode(
    bundle,
    mode,
    extension.toLowerCase() as ShinyliveLanguage
  );

  const action = await askUserForOpenAction();

  if (action === "open") {
    vscode.env.openExternal(vscode.Uri.parse(url));
  } else {
    await vscode.env.clipboard.writeText(url);
    vscode.window.showInformationMessage("Copied shinylive link to clipboard!");
  }
}

async function askUserForOpenAction(): Promise<UserOpenAction> {
  // first check if the user has set a default action
  const prefAction =
    vscode.workspace
      .getConfiguration("shiny.shinylive")
      .get<string>("action") || "ask";

  if (["open", "copy"].includes(prefAction)) {
    return prefAction as UserOpenAction;
  }

  const action = await vscode.window.showQuickPick(["open", "copy"], {
    title: "Open or copy the ShinyLive link?",
  });
  return (action || "open") as UserOpenAction;
}

async function askUserForMode(): Promise<ShinyliveMode> {
  // first check if the user has set a default mode
  const prefMode =
    vscode.workspace.getConfiguration("shiny.shinylive").get<string>("mode") ||
    "ask";

  if (["app", "editor"].includes(prefMode)) {
    return prefMode as ShinyliveMode;
  }

  // ask the user if they want to run the app or edit the code
  const mode = await vscode.window.showQuickPick(["app", "editor"], {
    title: "Which shinylive mode?",
  });

  return (mode || "editor") as ShinyliveMode;
}

function shinyliveUrlEncode(
  bundle: ShinyliveBundle,
  mode: ShinyliveMode = "editor",
  language: ShinyliveLanguage = "py"
) {
  const bundleJson = JSON.stringify(bundle);
  const bundleLZ = lzstring.compressToEncodedURIComponent(bundleJson);

  if (mode === "app") {
    const includeHeader = vscode.workspace
      .getConfiguration("shiny.shinylive")
      .get<boolean>("includeHeader");

    const h = includeHeader ? "" : "h=0&";

    return `https://shinylive.io/${language}/${mode}/#${h}code=${bundleLZ}`;
  }

  return `https://shinylive.io/${language}/${mode}/#code=${bundleLZ}`;
}
