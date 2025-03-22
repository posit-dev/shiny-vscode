/* eslint-disable @typescript-eslint/naming-convention */

import * as vscode from "vscode";
import { applyFileSetDiff, type DiffError } from "./diff";
import { inferFileType, type LangName, langNameToFileExt } from "./language";
import type { ProposedFilePreviewProvider } from "./proposed-file-preview-provider";
import { StateMachine } from "./state-machine";
import type { FileContent, FileSet } from "./types";

/**
 * Defines the possible states for the tag state machine.
 * Each state represents a different context in the chat response processing.
 */
export type ChatResponseStateName =
  | "TEXT"
  | "FILESET"
  | "FILE"
  | "DIFFCHUNK"
  | "DIFFOLD"
  | "DIFFNEW";

// Define event  type with discriminated union pattern
export type ChatResponseEventProcessText = {
  type: "processText";
  text: string;
};
export type ChatResponseEventOpenFileset = {
  type: "openFileset";
  format: "complete" | "diff";
};
export type ChatResponseEventCloseFileset = { type: "closeFileset" };
export type ChatResponseEventOpenFile = { type: "openFile"; name: string };
export type ChatResponseEventCloseFile = { type: "closeFile" };
export type ChatResponseEventOpenDiffChunk = { type: "openDiffChunk" };
export type ChatResponseEventCloseDiffChunk = { type: "closeDiffChunk" };
export type ChatResponseEventOpenDiffNew = { type: "openDiffNew" };
export type ChatResponseEventCloseDiffNew = { type: "closeDiffNew" };
export type ChatResponseEventOpenDiffOld = { type: "openDiffOld" };
export type ChatResponseEventCloseDiffOld = { type: "closeDiffOld" };

/**
 * Union type of all possible events that can be processed by the tag state machine.
 * Uses a discriminated union pattern with the 'type' property as the discriminator.
 */
export type ChatResponseEventObject =
  | ChatResponseEventProcessText
  | ChatResponseEventOpenFileset
  | ChatResponseEventCloseFileset
  | ChatResponseEventOpenFile
  | ChatResponseEventCloseFile
  | ChatResponseEventOpenDiffChunk
  | ChatResponseEventCloseDiffChunk
  | ChatResponseEventOpenDiffNew
  | ChatResponseEventCloseDiffNew
  | ChatResponseEventOpenDiffOld
  | ChatResponseEventCloseDiffOld;

/**
 * Utility type that extracts all possible event names from the event object union.
 */
export type ChatResponseEventNames = ChatResponseEventObject["type"];

// ============================================================================
// ChatResponseStateMachine
// ============================================================================

/**
 * Configuration options for the ChatResponseStateMachine.
 */
export type ChatResponseStateMachineConfig = {
  stream: vscode.ChatResponseStream;
  workspaceFolderUri: vscode.Uri;
  proposedFilePreviewProvider: ProposedFilePreviewProvider;
  proposedFilePreviewCounter: number;
  incrementPreviewCounter: () => number;
  projectLanguage: LangName;
};

/**
 * State machine for processing and rendering chat responses with structured content.
 *
 * This state machine handles the parsing and rendering of chat responses that may
 * contain regular text, filesets, individual files, and diff chunks. It manages
 * transitions between different content types and ensures proper rendering in the
 * VS Code chat interface.
 */
export class ChatResponseStateMachine extends StateMachine<
  ChatResponseStateName,
  ChatResponseEventObject
> {
  private config: ChatResponseStateMachineConfig;

  /**
   * Creates a new chat response state machine for processing chat responses.
   *
   * @param config - Configuration options for the state machine
   */
  constructor(config: ChatResponseStateMachineConfig) {
    super({ initialState: "TEXT" });
    this.config = config;

    // Define state machine transitions here
    this.states = {
      TEXT: {
        on: {
          processText: {
            action: this.renderText.bind(this),
          },
          openFileset: {
            target: "FILESET",
            action: this.openFileset.bind(this),
          },
        },
      },
      FILESET: {
        on: {
          processText: {},
          closeFileset: {
            target: "TEXT",
            action: this.closeFileset.bind(this),
          },
          openFile: {
            target: "FILE",
            action: this.openFile.bind(this),
          },
        },
      },
      FILE: {
        on: {
          processText: {
            action: this.renderFileText.bind(this),
          },
          closeFile: {
            target: "FILESET",
            action: this.closeFile.bind(this),
          },
          openDiffChunk: {
            target: "DIFFCHUNK",
            action: this.openDiffChunk.bind(this),
          },
        },
      },
      DIFFCHUNK: {
        on: {
          processText: {},
          openDiffNew: {
            target: "DIFFNEW",
            action: this.openDiffNew.bind(this),
          },
          openDiffOld: {
            target: "DIFFOLD",
            action: this.openDiffOld.bind(this),
          },
          closeDiffChunk: {
            target: "FILE",
          },
        },
      },
      DIFFNEW: {
        on: {
          processText: {
            action: this.renderDiffNewText.bind(this),
          },
          closeDiffNew: {
            target: "DIFFCHUNK",
          },
        },
      },
      DIFFOLD: {
        on: {
          processText: {
            action: this.renderDiffOldText.bind(this),
          },
          closeDiffOld: {
            target: "DIFFCHUNK",
          },
        },
      },

      "*": {
        on: {
          "*": {
            action: (eventObj: ChatResponseEventObject) => {
              console.log(
                `Unhandled event: in state "${this.currentState}" and received event "${eventObj.type}".`
              );
            },
          },
        },
      },
    };
  }

  /**
   * Checks if the state machine currently has an active fileset.
   *
   * @returns True if a fileset is currently being processed, false otherwise
   */
  hasFileSet(): boolean {
    return this.fileSet !== null;
  }

  /**
   * Gets any diff errors that occurred during processing.
   *
   * @returns Array of diff errors (currently always empty)
   */
  getDiffErrors(): DiffError[] {
    return this.diffErrors;
  }

  // ===========================================================================
  // Async operations
  // ===========================================================================
  // Track pending async operations
  private pendingAsyncOperations = new Set<Promise<void>>();

  /**
   * Checks if there are any pending async operations.
   *
   * @returns True if there are pending async operations, false otherwise
   */
  hasPendingAsyncOperations(): boolean {
    return this.pendingAsyncOperations.size > 0;
  }

  /**
   * Waits for all pending async operations to complete.
   *
   * @returns A promise that resolves when all pending operations are complete
   */
  async waitForPendingOperations(): Promise<void> {
    if (this.pendingAsyncOperations.size === 0) {
      return;
    }

    await Promise.all(Array.from(this.pendingAsyncOperations));
  }

  // ===========================================================================
  // State machine event handlers
  // ===========================================================================
  private fileSet: FileSet | null = null;
  private currentFile: FileContent | null = null;
  private diffErrors: DiffError[] = [];

  // In the FILE, DIFF_NEW, and DIFF_OLD state, the very first line of the file
  // content is a spurious newline.
  private fileStateHasRemovedFirstNewline = false;
  private diffOldStateHasRemovedFirstNewline = false;
  private diffOldStateLastCharWasNewline = false;
  private diffNewStateHasRemovedFirstNewline = false;
  private diffNewStateLastCharWasNewline = false;

  private renderText(eventObj: ChatResponseEventProcessText) {
    this.config.stream.markdown(eventObj.text);
  }

  private openFileset(eventObj: ChatResponseEventOpenFileset) {
    // Default format is "complete"
    const format = eventObj.format ?? "complete";
    if (format !== "complete" && format !== "diff") {
      throw new Error(`Invalid fileset format: ${format}`);
    }

    this.fileSet = {
      format,
      files: [],
    };
  }

  private closeFileset(eventObj: ChatResponseEventCloseFileset) {
    this.config.incrementPreviewCounter();
    const proposedFilesPrefixDir =
      "/app-preview-" + this.config.proposedFilePreviewCounter;

    // Create an async operation and track it
    const asyncOperation = this.processFileSetAsync(proposedFilesPrefixDir);
    this.pendingAsyncOperations.add(asyncOperation);

    // Clean up the pending operations list when this operation completes
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    asyncOperation.finally(() => {
      this.pendingAsyncOperations.delete(asyncOperation);
    });
  }

  /**
   * Processes the file set asynchronously.
   * This is extracted from closeFileset to handle all async operations.
   *
   * @param proposedFilesPrefixDir - Directory prefix for the proposed files
   * @returns A promise that resolves when processing is complete
   */
  private async processFileSetAsync(
    proposedFilesPrefixDir: string
  ): Promise<void> {
    if (this.fileSet!.format === "diff") {
      // For each file, if it ends with a trailing "\n", remove it. This is
      // because the LLM usually puts a "\n" before "</FILE>", but that "\n"
      // shouldn't actually be part of the diff context.
      for (const file of this.fileSet!.files) {
        if (file.type === "text" && file.content.endsWith("\n")) {
          file.content = file.content.replace(/\n$/, "");
        }
      }

      const result = await applyFileSetDiff(
        this.fileSet!,
        this.config.workspaceFolderUri.fsPath
      );

      this.fileSet = result.fileSet;
      this.diffErrors = result.diffErrors;
    }

    this.config.proposedFilePreviewProvider.addFiles(
      this.fileSet!.files,
      proposedFilesPrefixDir
    );

    this.config.stream.button({
      title: "View changes as diff",
      command: "shiny.assistant.showDiff",
      arguments: [
        this.fileSet!,
        this.config.workspaceFolderUri,
        proposedFilesPrefixDir,
      ],
    });

    this.config.stream.button({
      title: "Apply changes",
      command: "shiny.assistant.saveFilesToWorkspace",
      arguments: [this.fileSet!.files, true],
    });

    this.config.stream.markdown(
      new vscode.MarkdownString(
        `After you apply the changes, press the $(run) button in the upper right of the app.${langNameToFileExt(this.config.projectLanguage)} editor panel to run the app.\n\n`,
        true
      )
    );
  }

  private openFile(eventObj: ChatResponseEventOpenFile) {
    if (!this.fileSet) {
      throw new Error("Fileset not initialized");
    }

    // Create a mutable reference to the most recent file in this.fileSet.files.
    this.currentFile = {
      name: eventObj.name,
      content: "",
      type: "text",
    };

    this.fileSet.files.push(this.currentFile);

    this.fileStateHasRemovedFirstNewline = false;

    this.config.stream.markdown("\n### " + eventObj.name + "\n");
    this.config.stream.markdown("```");
    if (this.fileSet!.format === "diff") {
      this.config.stream.markdown("diff");
    } else {
      const fileType = inferFileType(eventObj.name);
      if (fileType !== "text") {
        this.config.stream.markdown(fileType);
      }
    }
    this.config.stream.markdown("\n");
  }

  private renderFileText(eventObj: ChatResponseEventProcessText) {
    let text = eventObj.text;

    // If we're in a diff fileset, the format is very different and we'll let
    // the handlers for the diff states handle the text.
    if (this.fileSet!.format === "diff") {
      return;
    }

    // The very first line of the FILE content is a spurious newline, because of
    // the XML tag format.
    if (!this.fileStateHasRemovedFirstNewline) {
      // Remove the first newline from the file content
      if (text.startsWith("\n")) {
        text = text.slice(1);
      }
      this.fileStateHasRemovedFirstNewline = true;
    }

    this.currentFile!.content += text;
    this.config.stream.markdown(text);
  }

  private closeFile(eventObj: ChatResponseEventCloseFile) {
    this.currentFile = null;
    this.config.stream.markdown("```");
    this.config.stream.markdown("\n");
  }

  // Note that the diffs are received as XML because the LLM is better at
  // generating diffs that way, but we convert them to a format that is the same
  // as unified diffs, except there are no line numbers.
  private openDiffChunk(eventObj: ChatResponseEventOpenDiffChunk) {
    this.currentFile!.content += "@@ ... @@\n";
    this.config.stream.markdown("@@ ... @@\n");
  }

  private openDiffOld(eventObj: ChatResponseEventOpenDiffOld) {
    this.diffOldStateHasRemovedFirstNewline = false;
    this.diffOldStateLastCharWasNewline = false;
  }

  private renderDiffOldText(eventObj: ChatResponseEventProcessText) {
    let text = eventObj.text;

    // Handle trailing newline. With the XML tag format, the </DIFFOLD> tag will
    // be on a line _after_ the last line of content. That means that the last
    // "\n" needs to be removed from the streaming output. The problem is that
    // after we stream the content, we can't go back and remove the trailing
    // newline.
    //
    // So instead, if a chunk of content ends with a newline, but we will keep
    // track of it. If we receive another chunk of text in this current state,
    // we'll add a leading "-". With the very last trailing newline in this
    // state, there won't be another chunk of text, so there won't be an extra
    // "-" added to the end.
    if (this.diffOldStateLastCharWasNewline) {
      text = "-" + text;
    }

    if (text.endsWith("\n")) {
      this.diffOldStateLastCharWasNewline = true;
      text = text.slice(0, -1).replaceAll("\n", "\n-") + "\n";
    } else {
      this.diffOldStateLastCharWasNewline = false;
      text = text.replaceAll("\n", "\n-");
    }

    // The very first line of the DIFFOLD content is a spurious newline, because
    // of the XML tag format.
    if (!this.diffOldStateHasRemovedFirstNewline) {
      // Remove the first newline from the file content
      if (text.startsWith("\n")) {
        text = text.slice(1);
      }
      this.diffOldStateHasRemovedFirstNewline = true;
    }

    this.currentFile!.content += text;
    this.config.stream.markdown(text);
  }

  private openDiffNew(eventObj: ChatResponseEventOpenDiffNew) {
    this.diffNewStateHasRemovedFirstNewline = false;
    this.diffNewStateLastCharWasNewline = false;
  }

  private renderDiffNewText(eventObj: ChatResponseEventProcessText) {
    // The implementation here is the same as for DiffOld, but with "+" instead
    // of "-".
    let text = eventObj.text;

    if (this.diffNewStateLastCharWasNewline) {
      text = "+" + text;
    }

    if (text.endsWith("\n")) {
      this.diffNewStateLastCharWasNewline = true;
      text = text.slice(0, -1).replaceAll("\n", "\n+") + "\n";
    } else {
      this.diffNewStateLastCharWasNewline = false;
      text = text.replaceAll("\n", "\n+");
    }

    if (!this.diffNewStateHasRemovedFirstNewline) {
      if (text.startsWith("\n")) {
        text = text.slice(1);
      }
      this.diffNewStateHasRemovedFirstNewline = true;
    }

    this.currentFile!.content += text;
    this.config.stream.markdown(text);
  }
}
