import * as path from "path";
import * as vscode from "vscode";
import type { FileContent, FileSetComplete, FileSetDiff } from "./types";

/*
This is what the diff format looks like:
---------------------------
@@ ... @@
 from shiny import App, ui, render

 app_ui = ui.page_fluid(
-    ui.output_text("message")
+    ui.output_code("greeting")
     )

 def server(input, output, session):
-    @render.text
-    def message():
-        return "Hello Shiny!"
+    @render.code
+    def greeting():
+        return "Hello Shiny!"

 app = App(app_ui, server)
---------------------------

It is similar to aunified diff, but lacks line numbers.

One limitation to this diff format is that if there are multiple matches for the
pattern (starting after the previous hunk), then it will always be the first one
that is replaced, even if the actual target was supposed to be a later match.
This is a limitation of the diff format. It would be better to require line
numbers like a traditional unified diff, but unfortunately, LLMs have trouble
generating accurate line numbers.
*/

export type DiffResult = {
  status: "success";
  value: string;
};

export type DiffError = {
  status: "error";
  message: string;
  extra: Record<string, string>;
};

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
export function applyDiff(
  original: string,
  diff: string
): DiffResult | DiffError {
  if (diff === "") {
    return { status: "success", value: original };
  }

  const hunks = parseDiff(diff);
  if (!(hunks instanceof Array)) {
    return hunks;
  }

  // Split the original text into lines
  const originalLines = original.split("\n");
  // Create a new array to hold the result
  const resultLines: string[] = [];

  let currentLine = 0;

  // Process each hunk in order
  for (const hunk of hunks) {
    // Extract pattern to search for (context + removed lines)
    const searchPattern: string[] = [];
    // Extract replacement (context + added lines)
    const replacement: string[] = [];

    // Build the search pattern and replacement
    for (const line of hunk) {
      if (line.type === "context" || line.type === "remove") {
        searchPattern.push(line.content);
      }

      if (line.type === "context" || line.type === "add") {
        replacement.push(line.content);
      }
    }

    // If we have a search pattern, try to find it in the original
    if (searchPattern.length > 0) {
      let patternFound = false;

      // Start searching from the current position
      for (
        let i = currentLine;
        i <= originalLines.length - searchPattern.length;
        i++
      ) {
        let found = true;
        for (let j = 0; j < searchPattern.length; j++) {
          if (originalLines[i + j] !== searchPattern[j]) {
            found = false;
            break;
          }
        }

        if (found) {
          // Copy lines up to the pattern
          while (currentLine < i) {
            resultLines.push(originalLines[currentLine]);
            currentLine++;
          }

          // Add the replacement lines
          for (const line of replacement) {
            resultLines.push(line);
          }

          // Skip past the pattern in the original
          currentLine += searchPattern.length;
          patternFound = true;
          break;
        }
      }

      if (!patternFound) {
        console.log(
          `Could not find pattern in hunk: ${searchPattern.join("\n")}`
        );
        console.log(`Original: ${originalLines.join("\n")}`);
        return {
          status: "error",
          message: "Could not find pattern to apply in hunk",
          extra: { pattern: searchPattern.join("\n") },
        };
      }
    } else if (hunk.length > 0) {
      // If there's no search pattern but we have added lines, just add them at
      // the current position
      for (const line of hunk) {
        if (line.type === "add") {
          resultLines.push(line.content);
        }
      }
    }
  }

  // Copy any remaining lines from the original
  while (currentLine < originalLines.length) {
    resultLines.push(originalLines[currentLine]);
    currentLine++;
  }

  // Join the result lines back into a single string
  return { status: "success", value: resultLines.join("\n") };
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
): Promise<DiffResult | DiffError> {
  const originalFileContent = (
    await vscode.workspace.fs.readFile(vscode.Uri.file(fileName))
  ).toString();

  const result = applyDiff(originalFileContent, diff);
  if (result.status === "error") {
    result.extra.fileName = fileName;
  }
  return result;
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
): Promise<{ fileSet: FileSetComplete; diffErrors: Array<DiffError> }> {
  const newFileSet: FileSetComplete = {
    format: "complete",
    files: [],
  };
  const diffErrors: Array<DiffError> = [];
  for (const file of fileSet.files) {
    // Error on binary file
    if (file.type === "binary") {
      diffErrors.push({
        status: "error",
        message: `Diff for binary file ${file.name} is not supported.`,
        extra: { filename: file.name },
      });
      continue;
    }

    const diffResult = await applyDiffToFile(
      file.content,
      path.join(originalDir, file.name)
    );

    if (diffResult.status === "success") {
      const newFile: FileContent = {
        name: file.name,
        content: diffResult.value,
        type: "text",
      };
      newFileSet.files.push(newFile);
    } else if (diffResult.status === "error") {
      diffErrors.push(diffResult);
    }
  }
  return { fileSet: newFileSet, diffErrors };
}

/**
 * Represents a hunk in a unified diff.
 *
 * A hunk is a section of a diff that represents a contiguous set of changes.
 */
type Hunk = Array<DiffLine>;

/**
 * Represents a single line in a diff.
 *
 * Each line has a type indicating whether it's being added, removed, or is context,
 * and the content of the line (without the leading +, -, or space character).
 */
type DiffLine = { type: "add" | "remove" | "context"; content: string };

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
function parseDiff(diff: string): Array<Hunk> | DiffError {
  const hunks: Array<Hunk> = [];
  const lines = diff.split("\n");
  let currentHunk: Hunk | null = null;

  // Sometimes the LLM will generate a diff with headers that show the filename.
  // If present, just ignore them.
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
    if (line === "@@ ... @@") {
      if (currentHunk) {
        // Finished the previous hunk
        hunks.push(currentHunk);
      }

      currentHunk = [];
      //
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
          return {
            status: "error",
            message: `Unknown line type: ${line[0]}`,
            extra: {},
          };
      }

      const content = line.slice(1);
      currentHunk.push({ type: lineType, content });
    } else {
      // Error because we're not in a hunk and we're not starting one
      return {
        status: "error",
        message: `Invalid diff format: ${line}`,
        extra: {},
      };
    }
  }
  if (currentHunk) hunks.push(currentHunk);
  return hunks;
}
