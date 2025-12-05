import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { isShinyAppRPart } from "./extension";

export type RunFromOption = "projectRoot" | "appDirectory";

/**
 * Resolves the working directory for a given Shiny app file.
 *
 * Resolution order:
 * 1. Check workspace-specific override (shiny.runFromOverrides)
 * 2. Fall back to global default (shiny.runFrom)
 * 3. Apply the setting to determine actual directory
 *
 * @param appFilePath - Absolute path to the Shiny app file
 * @returns Absolute path to the working directory
 */
export async function resolveWorkingDirectory(
  appFilePath: string
): Promise<string> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return path.dirname(appFilePath);
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;

  const relativePath = path.relative(workspaceRoot, appFilePath);
  if (relativePath.startsWith("..")) {
    return path.dirname(appFilePath);
  }

  const config = vscode.workspace.getConfiguration("shiny");

  const normalizedRelativePath = relativePath.split(path.sep).join("/");

  const inspectedOverrides =
    config.inspect<Record<string, string>>("runFromOverrides");
  const overrides = inspectedOverrides?.workspaceValue || {};

  if (normalizedRelativePath in overrides) {
    const overrideValue = overrides[normalizedRelativePath];
    if (overrideValue === "") {
      return workspaceRoot;
    }
    const resolvedPath = path.join(workspaceRoot, overrideValue);

    if (
      fs.existsSync(resolvedPath) &&
      fs.statSync(resolvedPath).isDirectory()
    ) {
      return resolvedPath;
    } else {
      console.warn(`[shiny] Override path does not exist: ${resolvedPath}`);
    }
  }

  const runFrom = config.get<RunFromOption>("runFrom", "projectRoot");

  if (runFrom === "projectRoot") {
    return workspaceRoot;
  } else {
    return path.dirname(appFilePath);
  }
}

/**
 * For multi-file R apps (ui.R, server.R, global.R), returns paths to all
 * existing sibling files in the same directory.
 *
 * @param appFilePath - Path to one file of a multi-file R app
 * @returns Array of absolute paths to all R app parts that exist
 */
export function getRMultiFileAppSiblings(appFilePath: string): string[] {
  if (!isShinyAppRPart(appFilePath)) {
    return [appFilePath];
  }

  const appDir = path.dirname(appFilePath);
  const possibleFiles = ["ui.R", "server.R", "global.R"];
  const siblings: string[] = [];

  for (const filename of possibleFiles) {
    const fullPath = path.join(appDir, filename);
    if (fs.existsSync(fullPath)) {
      siblings.push(fullPath);
    }
  }

  return siblings;
}

/**
 * Validates that a working directory path is valid for the current workspace.
 *
 * @param dirPath - Absolute path to validate
 * @param workspaceRoot - Workspace root path
 * @returns true if valid, false otherwise
 */
export function validateWorkingDirectory(
  dirPath: string,
  workspaceRoot: string
): boolean {
  if (!path.isAbsolute(dirPath)) {
    return false;
  }

  if (!fs.existsSync(dirPath)) {
    return false;
  }

  const stats = fs.statSync(dirPath);
  if (!stats.isDirectory()) {
    return false;
  }

  const relativePath = path.relative(workspaceRoot, dirPath);
  if (relativePath.startsWith("..")) {
    return false;
  }

  return true;
}
