/* eslint-disable @typescript-eslint/naming-convention */

import type * as vscode from "vscode";
import type { DiffError } from "./diff";
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
  workspaceFolderUri?: vscode.Uri;
  proposedFilePreviewProvider?: ProposedFilePreviewProvider;
  proposedFilePreviewCounter?: number;
  incrementPreviewCounter?: () => number;
  projectLanguage?: string;
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
            action: this.renderText.bind(this),
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
    if (eventObj.type === "processText") {
      console.log(`Processing text: ${eventObj.text}`);
    }
    this.config.stream.markdown(eventObj.text);
  }

  private openFileset(eventObj: ChatResponseEventOpenFileset) {
    // Default format is "complete"
    const format = eventObj.format ?? "complete";
    if (format !== "complete" && format !== "diff") {
      throw new Error(`Invalid fileset format: ${format}`);
    }

    console.log(`Opening fileset with format: ${format}`);
    this.fileSet = {
      format,
      files: [],
    };
  }

  private closeFileset(eventObj: ChatResponseEventCloseFileset) {
    console.log("Closing fileset");
  }

  private openFile(eventObj: ChatResponseEventOpenFile) {
    console.log(`Opening file: ${eventObj.name}`);
    if (!this.fileSet) {
      throw new Error("Fileset not initialized");
    }

    this.fileSet.files.push({
      name: eventObj.name,
      content: "",
      type: "text",
    });
  }

  private closeFile(eventObj: ChatResponseEventCloseFile) {
    console.log(
      `Closing file: ${this.fileSet?.files[this.fileSet?.files.length - 1].name}`
    );
  }
}
