import * as vscode from "vscode";
import * as lzstring from "lz-string";
import * as path from "path";
import * as fs from "fs";
import { isBinary } from "istextorbinary";
import { isShinyAppUsername } from "./extension";

type ShinyliveFile = {
  name: string;
  content: string;
  type?: "text" | "binary";
};

type UserOpenAction = "open" | "copy";
type ShinyliveMode = "app" | "editor";
type ShinyliveLanguage = "r" | "py";

type ShinyliveBundle = {
  language: ShinyliveLanguage;
  files: ShinyliveFile[];
  mode: ShinyliveMode;
};

/**
 * Command: Create a Shinylive app from the active file in the editor.
 *
 * The active file must be a single-file Shiny app in Python or R, named
 * `app.py` or `app.R` (or similar).
 *
 * @export
 * @async
 */
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

  await createAndOpenShinyliveApp(
    files,
    extension.toLowerCase() as ShinyliveLanguage
  );
}

/**
 * Create a Shinylive app link and ask the user how to open it.
 *
 * @async
 * @param {ShinyliveFile[]} files A list of files to include the app, structured
 * as `ShinyliveFile` objects.
 * @param {ShinyliveLanguage} [language="py"] One of `"py"` or `"r"`, defaults
 * to `"py"`.
 * @returns {string} The Shinylive URL.
 */
async function createAndOpenShinyliveApp(
  files: ShinyliveFile[],
  language: ShinyliveLanguage = "py"
): Promise<string> {
  const mode = await askUserForAppMode();
  const url = shinyliveUrlEncode({
    language,
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

  return url;
}

/**
 * Command: Save a Shinylive app from a Shinylive link.
 *
 * This command asks the user for a Shinylive link and a directory where the
 * files will be saved. The link is decoded and the files are saved into the
 * directory.
 *
 * @export
 * @async
 */
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

/**
 * Command: Save a Shinylive app from the Explorer context menu.
 *
 * This command creates a Shinylive app link from the selected files or
 * directories in the Explorer. Directories whose names start with `_` or `.`
 * are ignored to avoid adding private or sensitive files. Files within those
 * directories can be added directly, however.
 *
 * @export
 * @async
 * @param {vscode.Uri} _activatedFile The file that was right-clicked to
 * activate the command, not used.
 * @param {vscode.Uri[]} selectedFiles The files that were selected in the
 * Explorer.
 */
export async function shinyliveCreateFromExplorer(
  _activatedFile: vscode.Uri,
  selectedFiles: vscode.Uri[]
): Promise<void> {
  const allFiles: vscode.Uri[] = [];
  for (const file of selectedFiles) {
    const expanded = await readDirectoryRecursively(file);
    if (expanded) {
      allFiles.push(...expanded);
    }
  }

  const allFilesSorted = allFiles
    // Reduce file list to unique files only
    .filter(
      (file: vscode.Uri, index: number, self: vscode.Uri[]) =>
        index === self.findIndex((x) => x.fsPath === file.fsPath)
    )
    // Push shiny app file to the start of the list
    .sort((a, b) => {
      const aIsAppFile =
        isShinyAppUsername(a.path, "python") || isShinyAppUsername(a.path, "r");

      const bIsAppFile =
        isShinyAppUsername(b.path, "python") || isShinyAppUsername(b.path, "r");

      // A first (-1) or B first (+1) or same
      return -aIsAppFile + +bIsAppFile;
    });

  const primaryFile = allFilesSorted[0].path;
  const isPythonApp = isShinyAppUsername(primaryFile, "python");
  const isRApp = isShinyAppUsername(primaryFile, "r");

  if (!isPythonApp && !isRApp) {
    vscode.window.showErrorMessage(
      "The selected files did not contain a Shiny for Python or R app."
    );
    return;
  }

  const rootDir = path.dirname(primaryFile);

  const pathRelativeToRootDir = (file: vscode.Uri) =>
    path.relative(rootDir, file.path);

  const files = await Promise.all(
    allFilesSorted.map(async (file: vscode.Uri): Promise<ShinyliveFile> => {
      const type = isBinary(file.fsPath) ? "binary" : "text";
      let name = pathRelativeToRootDir(file);

      // Primary file needs to be `app.R` or `app.py` (or ui/server.R)
      if (file.path === primaryFile) {
        if (isPythonApp) {
          name = "app.py";
        } else if (isRApp && name.indexOf("app") >= 0) {
          name = "app.R";
        }
      }

      const contentRaw = await vscode.workspace.fs.readFile(file);
      const content =
        type === "binary"
          ? Buffer.from(contentRaw).toString("base64")
          : Buffer.from(contentRaw).toString();

      switch (type) {
        case "binary":
          return { name, content, type };

        default:
          // Save some characters by relying on the implicit type "text" default
          return { name, content };
      }
    })
  );

  await createAndOpenShinyliveApp(files, isPythonApp ? "py" : "r");
}

/**
 * Read a directory recursively and return a list of all files as `vscode.Uri`
 * objects. Directories whose names start with `_` or `.` are ignored.
 *
 * @async
 * @param {vscode.Uri} uri A `vscode.Uri` of any type. If not a directory, the
 * function returns an array with the single `vscode.Uri` object.
 * @returns {Promise<vscode.Uri[] | void>}
 */
async function readDirectoryRecursively(
  uri: vscode.Uri
): Promise<vscode.Uri[] | void> {
  const pathStat = await vscode.workspace.fs.stat(uri);
  if (pathStat.type !== vscode.FileType.Directory) {
    return [uri];
  }

  // Treat `_dir/` or `.dir/` as hidden directories and discard them
  if (["_", "."].some((chr) => path.basename(uri.path).startsWith(chr))) {
    return;
  }

  const files: vscode.Uri[] = [];
  const filesInDir = await vscode.workspace.fs.readDirectory(uri);

  for (const [name, type] of filesInDir) {
    if (type === vscode.FileType.Directory) {
      const subdir = vscode.Uri.file(`${uri.path}/${name}`);
      const subdirFiles = await readDirectoryRecursively(subdir);
      if (subdirFiles) {
        files.push(...subdirFiles);
      }
    } else {
      files.push(vscode.Uri.file(`${uri.path}/${name}`));
    }
  }

  return files;
}

/**
 * Consult the user's preferred open action, or ask them directly. The default
 * preference is `"ask"`, but users can choose `"open"` or `"copy"` in their
 * settings to avoid the prompt.
 *
 * @async
 * @returns {Promise<UserOpenAction>} One of `"open"` or `"copy"`.
 */
async function askUserForOpenAction(): Promise<UserOpenAction> {
  // first check if the user has set a default action
  const prefAction =
    vscode.workspace
      .getConfiguration("shiny.shinylive")
      .get<string>("openAction") || "ask";

  if (["open", "copy"].includes(prefAction)) {
    return prefAction as UserOpenAction;
  }

  const action = await vscode.window.showQuickPick(["open", "copy"], {
    title: "Open or copy the ShinyLive link?",
  });
  return (action || "open") as UserOpenAction;
}

/**
 * Consult the user's preferred Shinylive mode, or ask them directly. The
 * default preference is `"ask"`, but users can choose `"app"` or `"editor"` in
 * their settings to avoid the prompt.
 *
 * @async
 * @returns {Promise<ShinyliveMode>} One of `"app"` or `"editor"`.
 */
async function askUserForAppMode(): Promise<ShinyliveMode> {
  // first check if the user has set a default mode
  const prefMode =
    vscode.workspace
      .getConfiguration("shiny.shinylive")
      .get<string>("appMode") || "ask";

  if (["app", "editor"].includes(prefMode)) {
    return prefMode as ShinyliveMode;
  }

  // ask the user if they want to run the app or edit the code
  const mode = await vscode.window.showQuickPick(["app", "editor"], {
    title: "Which shinylive mode?",
  });

  return (mode || "editor") as ShinyliveMode;
}

/**
 * Request a Shinylive URL from the user.
 *
 * @async
 * @returns {Promise<string>} The URL the user entered, or an empty string if
 * the user canceled the input.
 */
async function askUserForUrl(): Promise<string> {
  const url = await vscode.window.showInputBox({
    title: "Enter or paste a Shinylive link",
  });

  return url || "";
}

let lastUsedDir = "";

/**
 * Ask the user for a directory where the Shinylive app will be saved.
 *
 * @async
 * @returns {Promise<vscode.Uri | undefined>} A `vscode.Uri` object of the
 * selected directory, or `undefined` if the user canceled the selection.
 */
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

/**
 * Encode a Shinylive bundle into a URL string.
 *
 * @param {ShinyliveBundle} { language, files, mode } A Shinylive bundle object
 * with the language, files, and mode to encode.
 * @returns {string} The encoded Shinylive URL.
 */
function shinyliveUrlEncode({ language, files, mode }: ShinyliveBundle) {
  const filesJson = JSON.stringify(files);
  const filesLZ = lzstring.compressToEncodedURIComponent(filesJson);

  const host = vscode.workspace
    .getConfiguration("shiny.shinylive")
    .get<string>("host");

  let includeHeader;
  if (mode === "app") {
    // Header is only relevant in the `app` mode
    includeHeader = vscode.workspace
      .getConfiguration("shiny.shinylive")
      .get<boolean>("includeHeader");
  }
  const h = includeHeader ? "" : "h=0&";

  return `${host}/${language}/${mode}/#${h}code=${filesLZ}`;
}

/**
 * Decode a Shinylive URL string into a Shinylive bundle object.
 *
 * @param {string} url The Shinylive URL string to decode.
 * @returns {ShinyliveBundle | undefined} The decoded Shinylive bundle, or
 * `undefined` if the URL could not be decoded.
 */
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

/**
 * Write a list of Shinylive files to the output directory.
 *
 * @async
 * @param {ShinyliveFile[]} files A list of files to write to the output
 * directory.
 * @param {vscode.Uri} outputDir The directory where the files will be saved.
 * @returns {Promise<string[]>} A list of the local file paths where the files
 * were saved.
 */
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
