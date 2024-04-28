import * as vscode from "vscode";
import * as lzstring from "lz-string";
import * as path from "path";
import * as fs from "fs";

type ShinyliveFile = {
  name: string;
  content: string;
  type: "text" | "binary";
};

type UserOpenAction = "open" | "copy";
type ShinyliveMode = "app" | "editor";
type ShinyliveLanguage = "r" | "py";

type ShinyliveBundle = {
  language: ShinyliveLanguage;
  files: ShinyliveFile[];
  mode: ShinyliveMode;
};

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

  const files: ShinyliveFile[] = [
    {
      name: `app.${extension}`,
      content,
      type: "text",
    },
  ];

  const mode = await askUserForMode();
  const url = shinyliveUrlEncode({
    language: extension.toLowerCase() as ShinyliveLanguage,
    files,
    mode,
  });

  const action = await askUserForOpenAction();

  if (action === "open") {
    vscode.env.openExternal(vscode.Uri.parse(url));
  } else {
    await vscode.env.clipboard.writeText(url);
    vscode.window.showInformationMessage("Copied shinylive link to clipboard!");
  }
}

export async function shinyliveSaveAppFromUrl(): Promise<void> {
  const url = await askUserForUrl();
  if (!url) {
    return;
  }

  const bundle = shinyliveUrlDecode(url);

  if (!bundle) {
    vscode.window.showErrorMessage("Failed to parse the Shinylive link.");
    return;
  }

  const { files, language } = bundle;

  if (files.length < 1) {
    vscode.window.showErrorMessage(
      "The Shinylive link did not contain any files."
    );
    return;
  }

  const outputDir = await askUserForDir();
  if (!outputDir) {
    vscode.window.showErrorMessage("Canceled: no directory selected.");
    return;
  }

  const localFiles = await shinyliveWriteFiles(files, outputDir);

  const doc = await vscode.workspace.openTextDocument(
    vscode.Uri.file(localFiles[0])
  );

  await vscode.window.showTextDocument(doc, 2, false);
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

async function askUserForUrl(): Promise<string> {
  const url = await vscode.window.showInputBox({
    title: "Enter or paste a Shinylive link",
  });

  return url || "";
}

let lastUsedDir = "";

async function askUserForDir(): Promise<vscode.Uri | undefined> {
  const defaultDir =
    lastUsedDir || vscode.workspace.workspaceFolders?.[0].uri.fsPath;

  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(defaultDir || "."),
    saveLabel: "App directory",
    title: "Choose a directory where Shinylive app will be saved",
  });

  if (uri) {
    // create directory based on uri
    await vscode.workspace.fs.createDirectory(uri);
    lastUsedDir = path.dirname(uri.path);
    return uri;
  }

  return;
}

function shinyliveUrlEncode({ language, files, mode }: ShinyliveBundle) {
  const filesJson = JSON.stringify(files);
  const filesLZ = lzstring.compressToEncodedURIComponent(filesJson);

  if (mode === "app") {
    const includeHeader = vscode.workspace
      .getConfiguration("shiny.shinylive")
      .get<boolean>("includeHeader");

    const h = includeHeader ? "" : "h=0&";

    return `https://shinylive.io/${language}/${mode}/#${h}code=${filesLZ}`;
  }

  return `https://shinylive.io/${language}/${mode}/#code=${filesLZ}`;
}

function shinyliveUrlDecode(url: string): ShinyliveBundle | undefined {
  const { hash, pathname } = new URL(url);
  const { searchParams } = new URL(
    "https://shinylive.io/?" + hash.substring(1)
  );

  const code = searchParams.get("code");

  if (!code) {
    return;
  }

  const filesJson = lzstring.decompressFromEncodedURIComponent(code);
  const files = JSON.parse(filesJson);

  const pathParts = pathname.split("/");

  return {
    language: pathParts[1] as ShinyliveLanguage,
    files: files as ShinyliveFile[],
    mode: pathParts[2] as ShinyliveMode,
  };
}

async function shinyliveWriteFiles(
  files: ShinyliveFile[],
  outputDir: vscode.Uri
): Promise<string[]> {
  const localFiles = [];

  for (const file of files) {
    const filePath = vscode.Uri.file(`${outputDir.fsPath}/${file.name}`);
    const fileDir = vscode.Uri.file(path.dirname(filePath.fsPath));

    if (!fs.existsSync(fileDir.fsPath)) {
      await vscode.workspace.fs.createDirectory(fileDir);
    }

    let contentBuffer: Buffer;

    switch (file.type) {
      case "binary":
        contentBuffer = Buffer.from(file.content, "base64");
        break;
      default:
        contentBuffer = Buffer.from(file.content);
        break;
    }

    await vscode.workspace.fs.writeFile(filePath, contentBuffer);

    localFiles.push(filePath.path);
  }

  return localFiles;
}
