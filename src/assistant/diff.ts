import * as path from "path";
import * as vscode from "vscode";
import type { FileContent, FileSetComplete, FileSetDiff } from "./types";

/**
 * Applies a diff string to an original string.
 *
 * This function takes a diff string and applies it to an original string,
 * returning the resulting string. The diff string is expected to be in the
 * format of a unified diff.
 *
 * @param original The original string to apply the diff to
 * @param diff The diff string to apply
 * @returns The resulting string after applying the diff
 */
export function applyDiff(original: string, diff: string): string {
  const hunks = parseDiff(diff);

  // Split the original text into lines
  const originalLines = original.split("\n");
  // Create a new array to hold the result
  const resultLines: string[] = [];

  let currentLine = 0;

  // Process each hunk in order
  for (const hunk of hunks) {
    // Copy lines up to the start of the current hunk
    while (currentLine < hunk.origStart - 1) {
      resultLines.push(originalLines[currentLine]);
      currentLine++;
    }

    // Verify that the result line count matches the expected new line start
    // The hunk.newStart is 1-indexed, but resultLines.length is 0-indexed
    if (resultLines.length + 1 !== hunk.newStart) {
      throw new Error(
        `Line number mismatch: expected new line ${hunk.newStart}, but got ${
          resultLines.length + 1
        }`
      );
    }

    // Process the lines in the hunk
    for (const line of hunk.lines) {
      switch (line.type) {
        case "context":
          // Context lines are present in both original and new versions
          resultLines.push(line.content);
          currentLine++;
          break;
        case "add":
          // Added lines are only in the new version
          resultLines.push(line.content);
          break;
        case "remove":
          // Removed lines are only in the original version
          // Skip them in the result, but advance the current line
          currentLine++;
          break;
      }
    }
  }

  // Copy any remaining lines from the original
  while (currentLine < originalLines.length) {
    resultLines.push(originalLines[currentLine]);
    currentLine++;
  }

  // Join the result lines back into a single string
  return resultLines.join("\n");
}

/**
 * Applies a diff to a file by reading the original file content and applying
 * the diff.
 *
 * @param diff The diff string to apply to the file
 * @param fileName The path to the original file
 * @returns A Promise resolving to the content of the file after applying the
 * diff
 */
export async function applyDiffToFile(
  diff: string,
  fileName: string
): Promise<string> {
  const originalFile = (
    await vscode.workspace.fs.readFile(vscode.Uri.file(fileName))
  ).toString();
  return applyDiff(originalFile, diff);
}

/**
 * Applies a set of diffs to files in a directory.
 *
 * This function takes a FileSetDiff object containing diffs for multiple files
 * and applies each diff to the corresponding file in the specified directory.
 *
 * @param fileSet A FileSetDiff object containing diffs for multiple files
 * @param originalDir The directory containing the original files
 * @returns A Promise resolving to a FileSetComplete object containing the
 * updated file contents
 * @throws Error if a diff for a binary file is encountered
 */
export async function applyFileSetDiff(
  fileSet: FileSetDiff,
  originalDir: string
): Promise<FileSetComplete> {
  const newFileSet: FileSetComplete = {
    format: "complete",
    files: [],
  };
  for (const file of fileSet.files) {
    // Error on binary
    if (file.type === "binary") {
      throw new Error(`Diff for binary file ${file.name} is not supported.`);
    }

    const newContent = await applyDiffToFile(
      file.content,
      path.join(originalDir, file.name)
    );

    const newFile: FileContent = {
      name: file.name,
      content: newContent,
      type: "text",
    };
    newFileSet.files.push(newFile);
  }
  return newFileSet;
}

/**
 * Represents a hunk in a unified diff.
 *
 * A hunk is a section of a diff that represents a contiguous set of changes.
 */
type Hunk = {
  /** The 1-indexed line number where the hunk starts in the original file */
  origStart: number;
  /** The number of lines from the original file included in this hunk */
  origLength: number;
  /** The 1-indexed line number where the hunk starts in the new file */
  newStart: number;
  /** The number of lines in the new file after applying this hunk */
  newLength: number;
  /** The lines in the hunk, each with a type and content */
  lines: Array<{ type: "add" | "remove" | "context"; content: string }>;
};

/**
 * Parses a unified diff string into an array of hunks.
 *
 * This function takes a diff string in the unified diff format and parses it
 * into an array of Hunk objects, each representing a section of changes.
 *
 * @param diff The unified diff string to parse
 * @returns An array of Hunk objects
 * @throws Error if an unknown line type is encountered
 */
function parseDiff(diff: string): Array<Hunk> {
  const hunks: Array<Hunk> = [];
  const lines = diff.split("\n");
  let currentHunk: Hunk | null = null;

  // Sometimes the LLM will generate a diff with headers that show the filename.
  // If present, just remove them.
  // For example:
  // --- app/ui.R
  // +++ app/ui.R
  if (
    lines.length >= 2 &&
    lines[0].startsWith("---") &&
    lines[1].startsWith("+++")
  ) {
    lines.shift();
    lines.shift();
  }

  for (const line of lines) {
    const newHunkMatch = line.match(/^@@ -(\d+)(,(\d+))? \+(\d+)(,(\d+))? @@$/);

    if (newHunkMatch) {
      if (currentHunk) {
        // Finished the previous hunk
        hunks.push(currentHunk);
      }
      // Extract the numbers from the match
      const origStart = parseInt(newHunkMatch[1], 10);
      const origLength = newHunkMatch[3] ? parseInt(newHunkMatch[3], 10) : 1;
      const newStart = parseInt(newHunkMatch[4], 10);
      const newLength = newHunkMatch[6] ? parseInt(newHunkMatch[6], 10) : 1;

      currentHunk = {
        origStart,
        origLength,
        newStart,
        newLength,
        lines: [],
      };
    } else if (currentHunk) {
      // Add a line to the current hunk
      let lineType: "add" | "remove" | "context";
      switch (line[0]) {
        case "+":
          lineType = "add";
          break;
        case "-":
          lineType = "remove";
          break;
        case " ":
          lineType = "context";
          break;
        case undefined:
          // Gets here if line is "". Some diffs don't put a leading space when
          // the context line is empty.
          lineType = "context";
          break;
        default:
          throw new Error(`Unknown line type: ${line[0]}`);
      }

      const content = line.slice(1);
      currentHunk.lines.push({ type: lineType, content });
    } else {
      // Error because we're not in a hunk and we're not starting one
      throw new Error(`Invalid diff format: ${line}`);
    }
  }
  if (currentHunk) hunks.push(currentHunk);
  return hunks;
}
