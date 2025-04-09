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

It is similar to a unified diff, but lacks line numbers.

One limitation to this diff format is that if there are multiple matches for the
pattern (starting after the previous hunk), then it will always be the first one
that is replaced, even if the actual target was supposed to be a later match.
This is a limitation of the diff format. It would be better to require line
numbers like a traditional unified diff, but unfortunately, LLMs have trouble
generating accurate line numbers.

The reason for using this format is that LLMs will more reliably generated it
than a traditional unified diff -- I was unable to get Claude 3.5 Sonnet to
generate unified diffs that worked more than about 70% of the time.

One limitation to this diff format is that if there are multiple matches for the
pattern (starting after the previous chunk), then it will always be the first
one that is replaced, even if the actual target was supposed to be a later
match. This is a limitation of the diff format. It would be better to require
line numbers like a traditional unified diff, but unfortunately, LLMs have
trouble generating accurate line numbers.
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
 * Removes trailing whitespace from a string.
 *
 * @param str The string to remove trailing whitespace from
 * @returns The string with trailing whitespace removed
 */
function removeTrailingWhitespace(str: string): string {
  return str.replace(/\s+$/, "");
}

/**
 * Applies a diff string to an original string.
 *
 * This function takes a diff string and applies it to an original string,
 * returning the resulting string. The diff string is expected to be in the
 * format of a unified diff.
 *
 * @param original The original string to apply the diff to
 * @param diff The diff string to apply
 * @param stripTrailingWhitespace Whether to strip trailing whitespace from
 *   the original text and diff's old text, for doing the pattern match.
 *   (default: true)
 * @returns The resulting string after applying the diff
 */
export function applyDiff(
  original: string,
  diff: string,
  // Unfortunately, we have to default this to true, because the LLMs
  // will often generate trailing whitespace in the diff.
  stripTrailingWhitespace = true
): DiffResult | DiffError {
  if (diff === "") {
    return { status: "success", value: original };
  }

  const chunks = parseDiff(diff);
  if (!(chunks instanceof Array)) {
    return chunks;
  }

  // Split the original text into lines
  const originalLines = original.split("\n");
  // Create a new array to hold the result
  const resultLines: string[] = [];

  let currentLine = 0;

  // Process each chunk in order
  for (const chunk of chunks) {
    // If we have a search pattern, try to find it in the original
    if (chunk.old.length > 0) {
      let patternFound = false;

      // Start searching from the current position
      for (
        let i = currentLine;
        i <= originalLines.length - chunk.old.length;
        i++
      ) {
        let found = true;
        for (let j = 0; j < chunk.old.length; j++) {
          let originalLine = originalLines[i + j];
          let chunkLine = chunk.old[j];
          // If we're stripping trailing whitespace, remove it from both
          // the original and the chunk line before comparing them
          if (stripTrailingWhitespace) {
            originalLine = removeTrailingWhitespace(originalLine);
            chunkLine = removeTrailingWhitespace(chunkLine);
          }

          if (originalLine !== chunkLine) {
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
          for (const line of chunk.new) {
            resultLines.push(line);
          }

          // Skip past the pattern in the original
          currentLine += chunk.old.length;
          patternFound = true;
          break;
        }
      }

      if (!patternFound) {
        console.log(
          `Could not find search pattern in chunk: ${chunk.old.join("\n")}`
        );
        console.log(`Original: ${originalLines.join("\n")}`);
        return {
          status: "error",
          message: "Could not find search pattern in chunk",
          extra: { pattern: chunk.old.join("\n") },
        };
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
  const originalFileUint8 = await vscode.workspace.fs.readFile(
    vscode.Uri.file(fileName)
  );
  const originalFileContent = originalFileUint8.toString();

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

type DiffChunk = {
  old: Array<string>;
  new: Array<string>;
};

/**
 * Parses a unified diff string into an array of chunks.
 *
 * This function takes a diff string in the unified diff format and parses it
 * into an array of Chunk objects, each representing a section of changes.
 *
 * Yes, they're called "chunks" instead of the traditional "hunk" here, because
 * this function has been gone through a number of versions where it worked on a
 * very different XML-based diff format.
 *
 * @param diff The unified diff string to parse
 * @returns An array of Chunk objects
 * @throws Error if an unknown line type is encountered
 */
function parseDiff(diff: string): Array<DiffChunk> | DiffError {
  const chunks: Array<DiffChunk> = [];
  const lines = diff.split("\n");
  let currentChunk: DiffChunk | null = null;

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
      if (currentChunk) {
        // Finished the previous chunk
        chunks.push(currentChunk);
      }

      currentChunk = { old: [], new: [] };
      //
    } else if (currentChunk) {
      const lineContent = line.slice(1);
      // Add a line to the current hunk
      switch (line[0]) {
        case "-":
          currentChunk.old.push(lineContent);
          break;
        case "+":
          currentChunk.new.push(lineContent);
          break;
        case " ":
          currentChunk.old.push(lineContent);
          currentChunk.new.push(lineContent);
          break;
        case undefined:
          // Gets here if line is "". Some diffs don't put a leading space when
          // the context line is empty.
          currentChunk.old.push("");
          currentChunk.new.push("");
          break;
        default:
          return {
            status: "error",
            message: `Unknown line type: ${line[0]}`,
            extra: {},
          };
      }
    } else {
      // Error because we're not in a hunk and we're not starting one
      return {
        status: "error",
        message: `Invalid diff format: ${line}`,
        extra: {},
      };
    }
  }
  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function parseDiffOld(diff: string): Array<DiffChunk> | DiffError {
  const chunks: Array<DiffChunk> = [];
  const lines = diff.split("\n");
  let currentChunk: DiffChunk | null = null;

  // State machine states
  type State = "OUTSIDE" | "IN_CHUNK" | "IN_OLD" | "IN_NEW";
  let state: State = "OUTSIDE";

  for (const line of lines) {
    switch (state) {
      case "OUTSIDE":
        if (line === "<DIFFCHUNK>") {
          state = "IN_CHUNK";
          currentChunk = { old: [], new: [] };
        } else if (line !== "") {
          return {
            status: "error",
            message: `Invalid diff format, unexpected line outside chunk: ${line}`,
            extra: {},
          };
        }
        break;

      case "IN_CHUNK":
        if (line === "<DIFFOLD>") {
          state = "IN_OLD";
        } else if (line === "<DIFFNEW>") {
          state = "IN_NEW";
        } else if (line === "</DIFFCHUNK>") {
          chunks.push(currentChunk!);
          state = "OUTSIDE";
          currentChunk = null;
        } else if (line !== "") {
          return {
            status: "error",
            message: `Invalid diff format, unexpected line in chunk: ${line}`,
            extra: {},
          };
        }
        break;

      case "IN_OLD":
        if (line === "</DIFFOLD>") {
          state = "IN_CHUNK";
        } else {
          currentChunk!.old.push(line);
        }
        break;

      case "IN_NEW":
        if (line === "</DIFFNEW>") {
          state = "IN_CHUNK";
        } else {
          currentChunk!.new.push(line);
        }
        break;
    }
  }

  // Check if we ended in an unexpected state
  if (state !== "OUTSIDE") {
    return {
      status: "error",
      message: `Invalid diff format, unexpected end of input in state: ${state}`,
      extra: {},
    };
  }

  return chunks;
}
