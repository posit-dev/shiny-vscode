/* eslint-disable @typescript-eslint/naming-convention */

import * as vscode from "vscode";
import { applyFileSetDiff, type DiffError } from "./diff";
import { inferFileType, type LangName, langNameToFileExt } from "./language";
import type { ProposedFilePreviewProvider } from "./proposed-file-preview-provider";
import { StateMachine } from "./state-machine";
import type { FileSet } from "./types";

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
  private fileSet: FileSet | null = null;
  private diffErrors: DiffError[] = [];

  // In the FILE state, the very first line of the file content is a spurious
  // newline.
  private fileStateHasRemovedFirstNewline = false;

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
        },
      },
      DIFFCHUNK: {},
      DIFFNEW: {},
      DIFFOLD: {},

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
    // return this.diffErrors;
    return [];
  }

  private renderText(eventObj: ChatResponseEventProcessText) {
    this.config.stream.markdown(eventObj.text);
  }

  private renderFileText(eventObj: ChatResponseEventProcessText) {
    const currentFile = this.fileSet!.files[this.fileSet!.files.length - 1];
    let text = eventObj.text;

    // The very first line of the FILE content is a spurious newline, because of
    // the XML tag format.
    if (!this.fileStateHasRemovedFirstNewline) {
      // Remove the first newline from the file content
      if (text.startsWith("\n")) {
        text = text.slice(1);
      }
      this.fileStateHasRemovedFirstNewline = true;
    }
    currentFile.content += text;
    this.config.stream.markdown(text);
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

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    (async () => {
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
    })();
  }

  private openFile(eventObj: ChatResponseEventOpenFile) {
    if (!this.fileSet) {
      throw new Error("Fileset not initialized");
    }

    this.fileStateHasRemovedFirstNewline = false;

    this.fileSet.files.push({
      name: eventObj.name,
      content: "",
      type: "text",
    });

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

  private closeFile(eventObj: ChatResponseEventCloseFile) {
    this.config.stream.markdown("```");
    this.config.stream.markdown("\n");
  }
}
