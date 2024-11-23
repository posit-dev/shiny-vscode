import { isBinary } from "istextorbinary";
import * as lzstring from "lz-string";
import * as path from "path";
import * as vscode from "vscode";
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
 * Command: Create a Shinylive link from the active editor.
 *
 * The active editor must be a single-file Shiny app in Python or R, named
 * `app.py` or `app.R` (or similar).
 *
 * @export
 * @async
 */
export async function shinyliveCreateFromActiveEditor(): Promise<void> {
  if (!vscode.window.activeTextEditor) {
    vscode.window.showErrorMessage("Shinylive: no editor is currently active.");
    return;
  }

  const content = vscode.window.activeTextEditor.document.getText();
  const {
    fileName: filePath,
    languageId: language,
    isUntitled,
  } = vscode.window.activeTextEditor.document;

  if (!language || !["r", "python"].includes(language)) {
    vscode.window.showErrorMessage(
      "Shinylive only supports Python and R apps."
    );
    return;
  }

  if (!isUntitled) {
    const { name: fileName } = path.parse(filePath);

    if (!/(^app|app$)/i.test(fileName)) {
      vscode.window.showErrorMessage(
        "Shinylive: A single-file Shiny app is required when creating a link from the active editor."
      );
      return;
    }
  }

  const extension = language === "r" ? "R" : "py";

  const files: ShinyliveFile[] = [
    {
      name: `app.${extension}`,
      content,
      type: "text",
    },
  ];

  await createAndOpenShinyliveLink(
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
 * @returns {string} The Shinylive URL, or undefined if the user cancelled.
 */
async function createAndOpenShinyliveLink(
  files: ShinyliveFile[],
  language: ShinyliveLanguage = "py"
): Promise<string | void> {
  const mode = await askUserForAppMode();
  if (!mode) {
    return;
  }

  const url = shinyliveUrlEncode({
    language,
    files,
    mode,
  });

  const action = await askUserForOpenAction();
  if (!action) {
    return;
  }

  if (action === "open") {
    vscode.env.openExternal(vscode.Uri.parse(url));
  } else {
    await vscode.env.clipboard.writeText(url);
    vscode.window.showInformationMessage("Copied shinylive link to clipboard!");
  }

  return url;
}

/**
 * Command: Save a Shiny app from a Shinylive link.
 *
 * This command asks the user for a Shinylive link and a directory where the
 * files will be saved. The link is decoded and the files are saved into the
 * directory.
 *
 * @param {string} [url] The Shinylive URL to save the app from. If not provided
 * the user will be prompted to enter a URL.
 *
 * @export
 * @async
 */
export async function shinyliveSaveAppFromUrl(
  url: string | undefined
): Promise<void> {
  if (typeof url === "undefined") {
    url = await askUserForUrl();
  }

  if (!url) {
    return;
  }

  const bundle = shinyliveUrlDecode(url);

  if (!bundle) {
    vscode.window.showErrorMessage(
      "Shinylive: Failed to parse the Shinylive link. " +
        "Please check the link and try again."
    );
    return;
  }

  const { files, language } = bundle;

  if (files.length < 1) {
    vscode.window.showErrorMessage(
      "Shinylive: The provided link did not contain any files."
    );
    return;
  }

  if (filesAreNotContainedSingleDir(files)) {
    return;
  }

  const isSingleFileApp = files.length === 1;

  let outputDir: vscode.Uri | undefined;

  if (isSingleFileApp) {
    const outputFile = await askUserForOutputFile(files[0].name);
    if (outputFile) {
      // Rename the file in the app bundle to match the user's requested file name
      files[0].name = path.basename(outputFile.path);
      outputDir = outputFile.with({ path: path.dirname(outputFile.path) });
    }
  } else {
    outputDir = await askUserForOutputDirectory();
  }

  if (!outputDir) {
    return;
  }

  const localFiles = await shinyliveWriteFiles(
    files,
    outputDir,
    files.length > 1 // confirmOverwrite: vscode save dialog will have asked already
  );

  if (localFiles.length === 0) {
    return;
  }

  const doc = await vscode.workspace.openTextDocument(localFiles[0]);

  await vscode.window.showTextDocument(doc, undefined, false);
}

function filesAreNotContainedSingleDir(files: ShinyliveFile[]): boolean {
  const bad = files.map((f) => f.name).filter((nm) => nm.startsWith(".."));

  if (bad.length) {
    vscode.window.showErrorMessage(
      "Shinylive link includes files that cannot be written into a " +
        "single, contained directory, e.g. '" +
        bad[0] +
        "'. " +
        "Please edit the file paths on Shinylive " +
        "and try again."
    );
  }

  return bad.length > 0;
}

/**
 * Command: Create a Shinylive link from the Explorer context menu.
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
      "Shinylive: the selected files did not contain a Shiny for Python or R app."
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

  await createAndOpenShinyliveLink(files, isPythonApp ? "py" : "r");
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
 * @returns {Promise<UserOpenAction>} One of `"open"` or `"copy"`, or an empty
 * string if the user cancelled.
 */
async function askUserForOpenAction(): Promise<UserOpenAction | ""> {
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

  return action ? (action as UserOpenAction) : "";
}

/**
 * Consult the user's preferred Shinylive mode, or ask them directly. The
 * default preference is `"ask"`, but users can choose `"app"` or `"editor"` in
 * their settings to avoid the prompt.
 *
 * @async
 * @returns {Promise<ShinyliveMode>} One of `"app"` or `"editor"`, or an empty
 * string if the user cancelled.
 */
async function askUserForAppMode(): Promise<ShinyliveMode | ""> {
  // first check if the user has set a default mode
  const prefMode =
    vscode.workspace
      .getConfiguration("shiny.shinylive")
      .get<string>("appMode") || "ask";

  if (["app", "editor"].includes(prefMode)) {
    return prefMode as ShinyliveMode;
  }

  const options: vscode.QuickPickItem[] = [
    {
      label: "app",
      detail: "App mode displays only the app on Shinylive.",
    },
    {
      label: "editor",
      detail: "Editor mode displays the app alongside an editor and console.",
    },
  ];

  const mode = await vscode.window.showQuickPick(options, {
    title: "Which Shinylive mode?",
  });

  return mode ? (mode.label as ShinyliveMode) : "";
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

let lastUsedDir: vscode.Uri;

/**
 * Ask the user for an output location where a single-file Shinylive app will be
 * saved. VS Code will create non-existent directories and ask the user to
 * confirm they want to overwrite existing files.
 *
 * @async
 * @param {string} [defaultName] The default file name used in the save dialog.
 * @returns {Promise<vscode.Uri | undefined>} A `vscode.Uri` object of the
 * selected file, or `undefined` if the user canceled the selection.
 */
async function askUserForOutputFile(
  defaultName: string
): Promise<vscode.Uri | undefined> {
  const initDir = lastUsedDir || vscode.workspace.workspaceFolders?.[0].uri;
  const defaultUri = vscode.Uri.joinPath(initDir, defaultName);

  const uri = await vscode.window.showSaveDialog({
    defaultUri: defaultUri,
    saveLabel: "App file",
    title: "Choose a path for the Shinylive app",
    filters: defaultName
      ? defaultName.endsWith(".py")
        ? // eslint-disable-next-line @typescript-eslint/naming-convention
          { Python: ["py"] }
        : // eslint-disable-next-line @typescript-eslint/naming-convention
          { R: ["R", "r"] }
      : undefined,
  });

  if (!uri) {
    // Reset the last used directory if the user cancels, otherwise they can
    // get stuck in the "local" directory picker on remote vscode instances
    lastUsedDir = initDir || vscode.Uri.file(".");

    return;
  }

  lastUsedDir = uri.with({ path: path.dirname(uri.path) });
  return uri;
}

/**
 * Ask the user for an output directory where a multi-file Shinylive app will be
 * saved. VS Code will force the user to pick a non-existent directory.
 *
 * @async
 * @returns {Promise<vscode.Uri | undefined>} A `vscode.Uri` object of the
 * selected directory, or `undefined` if the user canceled the selection.
 */
async function askUserForOutputDirectory(): Promise<vscode.Uri | undefined> {
  let defaultUri = lastUsedDir || vscode.workspace.workspaceFolders?.[0].uri;

  const uri = await vscode.window.showSaveDialog({
    defaultUri: defaultUri,
    saveLabel: "App directory",
    title: "Choose a directory for the Shinylive app and files",
  });

  if (!uri) {
    // Reset the last used directory if the user cancels, otherwise they can
    // get stuck in the "local" directory picker on remote vscode instances
    lastUsedDir = defaultUri || vscode.Uri.file(".");

    return;
  }

  if (uri.scheme !== "file") {
    vscode.window.showErrorMessage(
      "Shinylive: Remote directories are not supported at this time. " +
        "Please save the app locally instead."
    );
    return;
  }

  try {
    await vscode.workspace.fs.createDirectory(uri);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Shinylive failed to create new directory "${uri.toString()}". ${error}`
    );
    return;
  }

  lastUsedDir = uri;
  return uri;
}

/**
 * Encode a Shinylive bundle into a URL string.
 *
 * @param {ShinyliveBundle} { language, files, mode } A Shinylive bundle object
 * with the language, files, and mode to encode.
 * @returns {string} The encoded Shinylive URL.
 */
export function shinyliveUrlEncode({ language, files, mode }: ShinyliveBundle) {
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
export function shinyliveUrlDecode(url: string): ShinyliveBundle | undefined {
  const { hash, pathname } = new URL(url);
  const { searchParams } = new URL(
    "https://shinylive.io/?" + hash.substring(1)
  );

  const code = searchParams.get("code");

  if (!code) {
    return;
  }

  const filesJson = lzstring.decompressFromEncodedURIComponent(code);
  const files = JSON.parse(filesJson).map((file: ShinyliveFile) => {
    file.name = path.normalize(file.name);
    return file;
  });

  const pathParts = pathname.split("/");
  const language: ShinyliveLanguage = pathParts.includes("py") ? "py" : "r";
  const mode: ShinyliveMode = pathParts.includes("editor") ? "editor" : "app";

  return { language, mode, files: files as ShinyliveFile[] };
}

/**
 * Write a list of Shinylive files to the output directory.
 *
 * @async
 * @param {ShinyliveFile[]} files A list of files to write to the output
 * directory.
 * @param {vscode.Uri} outputDir The directory where the files will be saved.
 * @param {boolean} confirmOverwrite When `true`, confirm with the user before
 * overwriting existing files.
 * @returns {Promise<string[]>} A list of the local file paths where the files
 * were saved, or an empty array if the user cancels due to existing file
 * conflicts.
 */
async function shinyliveWriteFiles(
  files: ShinyliveFile[],
  outputDir: vscode.Uri,
  confirmOverwrite = true
): Promise<vscode.Uri[]> {
  const localFiles = [];

  for (const file of files) {
    const filePath = vscode.Uri.joinPath(outputDir, file.name);
    const fileDir = filePath.with({ path: path.dirname(filePath.path) });

    if (fileDir.scheme === "file" && !(await pathExists(fileDir))) {
      // Create the directory if it doesn't exist, local filesystems only
      try {
        await vscode.workspace.fs.createDirectory(fileDir);
      } catch (error) {
        vscode.window.showErrorMessage(
          `Shinylive failed to create directory "${fileDir.toString()}". ${error}`
        );
        return [];
      }
    }

    let contentBuffer: Buffer;

    switch (file.type) {
      case "binary":
        contentBuffer = Buffer.from(file.content, "base64");
        break;
      default:
        contentBuffer = Buffer.from(file.content, "utf8");
        break;
    }

    if (!confirmOverwrite || (await askUserToConfirmOverwrite(filePath))) {
      try {
        await vscode.workspace.fs.writeFile(filePath, contentBuffer);
        localFiles.push(filePath);
      } catch (error) {
        vscode.window.showErrorMessage(
          `Shinylive failed to write file ${
            file.name
          } to "${filePath.toString()}". ${error}`
        );
        return [];
      }
    }
  }

  return localFiles;
}

async function askUserToConfirmOverwrite(filePath: vscode.Uri) {
  if (filePath.scheme !== "file") {
    // We can't stat remote files, so we have to assume they don't exist
    return true;
  }

  const exists = await pathExists(filePath);
  if (!exists) {
    return true;
  }

  const userOverwrite = await vscode.window.showInformationMessage(
    `File exists, overwrite? "${filePath.fsPath}"`,
    "Yes",
    "No"
  );

  return userOverwrite === "Yes";
}

async function pathExists(file: vscode.Uri): Promise<boolean> {
  try {
    typeof (await vscode.workspace.fs.stat(file)).type !== "undefined";
    return true;
  } catch (error) {
    return false;
  }
}
