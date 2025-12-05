import * as path from "path";
import * as vscode from "vscode";
import { isShinyAppFilename } from "./extension";
import {
  getRMultiFileAppSiblings,
  validateWorkingDirectory,
} from "./working-directory";
import type { RunFromOption } from "./working-directory";

interface WorkingDirOption extends vscode.QuickPickItem {
  value: "projectRoot" | "appDirectory" | "custom";
}

export async function setRunFromOverride(): Promise<void> {
  const appFilePath = vscode.window.activeTextEditor?.document.uri.fsPath;
  if (!appFilePath) {
    vscode.window.showErrorMessage("No active file");
    return;
  }

  const languageId = vscode.window.activeTextEditor?.document.languageId;
  if (languageId !== "python" && languageId !== "r") {
    vscode.window.showErrorMessage("Active file is not a Shiny app");
    return;
  }

  if (!isShinyAppFilename(appFilePath, languageId)) {
    vscode.window.showErrorMessage(
      "Active file is not a recognized Shiny app file"
    );
    return;
  }

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage(
      "This command requires an open workspace folder"
    );
    return;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  const relativePath = path.relative(workspaceRoot, appFilePath);

  if (relativePath.startsWith("..")) {
    vscode.window.showErrorMessage(
      "Active file is outside the workspace folder"
    );
    return;
  }

  const config = vscode.workspace.getConfiguration("shiny");
  const inspectedOverrides = config.inspect<Record<string, string>>(
    "runFromOverrides"
  );
  const overrides = inspectedOverrides?.workspaceValue || {};
  const globalDefault = config.get<RunFromOption>("runFrom", "projectRoot");

  const normalizedRelativePath = relativePath.split(path.sep).join("/");

  let currentSetting: string;
  if (normalizedRelativePath in overrides) {
    const override = overrides[normalizedRelativePath];
    currentSetting = override === "" ? "Project Root" : `Custom: ${override}`;
  } else {
    currentSetting =
      globalDefault === "projectRoot" ? "Project Root" : "App Directory";
  }

  const appDirName = path.basename(path.dirname(appFilePath));
  const options: WorkingDirOption[] = [
    {
      label: "Project Root",
      description: path.basename(workspaceRoot),
      detail: `Use ${workspaceRoot}`,
      value: "projectRoot",
    },
    {
      label: "App Directory",
      description: appDirName,
      detail: `Use ${path.dirname(appFilePath)}`,
      value: "appDirectory",
    },
    {
      label: "Choose Folder...",
      description: "Browse for a custom directory",
      value: "custom",
    },
  ];

  const selected = await vscode.window.showQuickPick(options, {
    placeHolder: `Current: ${currentSetting}`,
    title: "Run this app from...",
  });

  if (!selected) {
    return;
  }

  let targetPath: string;

  if (selected.value === "custom") {
    const selectedUri = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      defaultUri: vscode.Uri.file(workspaceRoot),
      openLabel: "Select Working Directory",
    });

    if (!selectedUri || selectedUri.length === 0) {
      return;
    }

    targetPath = selectedUri[0].fsPath;

    if (!validateWorkingDirectory(targetPath, workspaceRoot)) {
      vscode.window.showErrorMessage(
        "Selected directory must be within the workspace"
      );
      return;
    }
  } else if (selected.value === "projectRoot") {
    targetPath = workspaceRoot;
  } else {
    targetPath = path.dirname(appFilePath);
  }

  const relativeTargetPath = path.relative(workspaceRoot, targetPath);
  const normalizedTarget =
    relativeTargetPath === ""
      ? ""
      : relativeTargetPath.split(path.sep).join("/");

  const filesToUpdate =
    languageId === "r"
      ? getRMultiFileAppSiblings(appFilePath)
      : [appFilePath];

  const newOverrides = { ...overrides };

  for (const filePath of filesToUpdate) {
    const fileRelativePath = path
      .relative(workspaceRoot, filePath)
      .split(path.sep)
      .join("/");

    newOverrides[fileRelativePath] = normalizedTarget;
  }

  await config.update(
    "runFromOverrides",
    newOverrides,
    vscode.ConfigurationTarget.Workspace
  );

  vscode.window.showInformationMessage(
    `Shiny app will now run from: ${targetPath}`
  );
}
