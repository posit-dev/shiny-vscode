/* eslint-disable @typescript-eslint/naming-convention */

import * as vscode from "vscode";
import { applyFileSetDiff, type DiffError } from "./diff";
import { inferFileType, langNameToFileExt, type LangName } from "./language";
import type { ProposedFilePreviewProvider } from "./proposed-file-preview-provider";
import { StateMachine } from "./state-machine";
import {
  StreamingTagParser,
  type ProcessedTag,
  type ProcessedText,
} from "./streaming-tag-parser";
import type { FileContent, FileSet } from "./types";

/**
 * Names of XML-like tags, like <FILESET>, <FILE>, <DIFFCHUNK>, etc., that are
 * used in chat responses.
 */
export const chatResponseKnownTags = [
  "FILESET",
  "FILE",
  "DIFFCHUNK",
  "DIFFOLD",
  "DIFFNEW",
] as const;

/**
 * Extract the _type_ of the known tags from the array of known tags.
 */
export type ChatResponseKnownTags = (typeof chatResponseKnownTags)[number];

/**
 * Defines the possible states for the tag state machine.
 * Each state represents a different context in the chat response processing.
 */
export type ChatResponseStateName =
  | "IN_TEXT"
  | "IN_FILESET"
  | "IN_FILE"
  | "IN_DIFFCHUNK"
  | "IN_DIFFNEW"
  | "IN_DIFFOLD";

// ============================================================================
// Event types
// ============================================================================
// Each event type represents a different kind of content that can be processed
// by the state machine.

/**
 * This event type represents a block of text content.
 */
export type EventText = {
  type: "text";
  text: string;
};

/**
 * The base type for events that represent processing of XML-like tags.
 */
export type EventTagBase = {
  type: "tag";
  name: ChatResponseKnownTags;
};

/**
 * The open and close tag events are distinguished by their `kind` attribute.
 */
export type EventTagOpenBase = EventTagBase & {
  kind: "open";
};
export type EventTagCloseBase = EventTagBase & {
  kind: "close";
};

/**
 * Now we define the specific tag events for each known tag type. Each one has
 * an open and close event, and each open event may have additional attributes.
 */
export type EventTagFilesetOpen = EventTagOpenBase & {
  name: "FILESET";
  attributes: Readonly<{ FORMAT?: "complete" | "diff" }>;
};
export type EventTagFilesetClose = EventTagCloseBase & {
  name: "FILESET";
};

export type EventTagFileOpen = EventTagOpenBase & {
  name: "FILE";
  attributes: Readonly<{ NAME: string }>;
};
export type EventTagFileClose = EventTagCloseBase & {
  name: "FILE";
};

export type EventTagDiffChunkOpen = EventTagOpenBase & {
  name: "DIFFCHUNK";
};
export type EventTagDiffChunkClose = EventTagCloseBase & {
  name: "DIFFCHUNK";
};

export type EventTagDiffNewOpen = EventTagOpenBase & {
  name: "DIFFNEW";
};
export type EventTagDiffNewClose = EventTagCloseBase & {
  name: "DIFFNEW";
};

export type EventTagDiffOldOpen = EventTagOpenBase & {
  name: "DIFFOLD";
};
export type EventTagDiffOldClose = EventTagCloseBase & {
  name: "DIFFOLD";
};

// Union type of all possible tag events
export type EventTag =
  | EventTagFilesetOpen
  | EventTagFilesetClose
  | EventTagFileOpen
  | EventTagFileClose
  | EventTagDiffChunkOpen
  | EventTagDiffChunkClose
  | EventTagDiffNewOpen
  | EventTagDiffNewClose
  | EventTagDiffOldOpen
  | EventTagDiffOldClose;

// Union type of all possible events that can be processed by the state machine
export type ChatResponseEvents = EventText | EventTag;

// ============================================================================
// StreamingChatResponseHandler
// ============================================================================

/**
 * Configuration options for the StreamingChatResponseHandler.
 */
export type StreamingChatResponseHandlerConfig = {
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
export class StreamingChatResponseHandler {
  private machine: StateMachine<ChatResponseStateName, ChatResponseEvents>;
  private streamingTagParser: StreamingTagParser<ChatResponseKnownTags>;
  private config: StreamingChatResponseHandlerConfig;
  private pendingAsyncOperations = new Set<Promise<void>>();
  private fileSet: FileSet | null = null;
  private currentFile: FileContent | null = null;
  private diffErrors: DiffError[] = [];
  private fileStateHasRemovedFirstNewline = false;
  private diffOldStateHasRemovedFirstNewline = false;
  private diffOldStateLastCharWasNewline = false;
  private diffNewStateHasRemovedFirstNewline = false;
  private diffNewStateLastCharWasNewline = false;

  /**
   * Creates a new chat response state machine for processing chat responses.
   *
   * @param config - Configuration options for the state machine
   */
  constructor(config: StreamingChatResponseHandlerConfig) {
    this.config = config;

    this.streamingTagParser = new StreamingTagParser<ChatResponseKnownTags>({
      tagNames: chatResponseKnownTags,
      contentHandler: (content) => this.handlePiece(content),
    });

    this.machine = new StateMachine<ChatResponseStateName, ChatResponseEvents>({
      initialState: "IN_TEXT",

      // =========================================================================
      // Define state machine transitions
      // =========================================================================
      states: {
        IN_TEXT: {
          on: {
            text: {
              action: this.renderText.bind(this),
            },
            tag: [
              {
                guard: (e: EventTag): e is EventTagFilesetOpen =>
                  e.kind === "open" && e.name === "FILESET",
                target: "IN_FILESET",
                action: this.openFileset.bind(this),
              },
            ],
          },
        },

        IN_FILESET: {
          on: {
            tag: [
              {
                guard: (e: EventTag): e is EventTagFilesetClose =>
                  e.kind === "close" && e.name === "FILESET",
                target: "IN_TEXT",
                action: this.closeFileset.bind(this),
              },
              {
                guard: (e: EventTag): e is EventTagFileOpen =>
                  e.kind === "open" && e.name === "FILE",
                target: "IN_FILE",
                action: this.openFile.bind(this),
              },
            ],
          },
        },

        IN_FILE: {
          on: {
            text: {
              guard: (e: EventText): e is EventText => e.type === "text",
              action: this.renderFileText.bind(this),
            },
            tag: [
              {
                guard: (e: EventTag): e is EventTagFileClose =>
                  e.kind === "close" && e.name === "FILE",
                target: "IN_FILESET", // Return to parent state
                action: this.closeFile.bind(this),
              },
              {
                guard: (e: EventTag): e is EventTagDiffChunkOpen =>
                  e.kind === "open" && e.name === "DIFFCHUNK",
                target: "IN_DIFFCHUNK",
                action: this.openDiffChunk.bind(this),
              },
            ],
          },
        },

        IN_DIFFCHUNK: {
          on: {
            tag: [
              {
                guard: (e: EventTag): e is EventTagDiffNewOpen =>
                  e.kind === "open" && e.name === "DIFFNEW",
                target: "IN_DIFFNEW",
                action: this.openDiffNew.bind(this),
              },
              {
                guard: (e: EventTag): e is EventTagDiffOldOpen =>
                  e.kind === "open" && e.name === "DIFFOLD",
                target: "IN_DIFFOLD",
                action: this.openDiffOld.bind(this),
              },
              {
                guard: (e: EventTag): e is EventTagDiffChunkClose =>
                  e.kind === "close" && e.name === "DIFFCHUNK",
                target: "IN_FILE", // Return to parent state
              },
            ],
          },
        },

        IN_DIFFNEW: {
          on: {
            text: {
              guard: (e: EventText): e is EventText => e.type === "text",
              action: this.renderDiffNewText.bind(this),
            },
            tag: [
              {
                guard: (e: EventTag): e is EventTagDiffNewClose =>
                  e.kind === "close" && e.name === "DIFFNEW",
                target: "IN_DIFFCHUNK", // Return to parent state
              },
            ],
          },
        },

        IN_DIFFOLD: {
          on: {
            text: {
              guard: (e: EventText): e is EventText => e.type === "text",
              action: this.renderDiffOldText.bind(this),
            },
            tag: [
              {
                guard: (e: EventTag): e is EventTagDiffOldClose =>
                  e.kind === "close" && e.name === "DIFFOLD",
                target: "IN_DIFFCHUNK", // Return to parent state
              },
            ],
          },
        },

        // Wildcard state for unhandled events
        "*": {
          on: {
            "*": {
              action: (eventObj: EventText | EventTag) => {
                console.log(
                  `Unhandled event: in state "${this.machine.currentState}" and received event "${eventObj.type}".`
                );
              },
            },
          },
        },
      },
    });
  }

  // ===========================================================================
  // Public methods
  // ===========================================================================

  /**
   * Processes a chunk of incoming text from a chat response stream. Delegates
   * the processing to the underlying streamingTagParser which identifies and
   * handles XML-like tags in the response.
   *
   * @param chunk - The chunk of text to process from the chat response stream
   */
  process(chunk: string): void {
    this.streamingTagParser.process(chunk);
  }

  /**
   * Flushes any remaining content that has been buffered but not yet processed.
   * Should be called at the end of a chat response stream to ensure all content
   * is properly handled.
   */
  flush(): void {
    this.streamingTagParser.flush();
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
  // Piece handler callback
  // ===========================================================================
  // This is a callback that is passed to the streaming tag parser; when the
  // streaming tag parser identifies a tag or text fragment, it invokes this
  // callback.

  /**
   * Processes content chunks from the streaming tag processor and dispatches
   * appropriate events to the state machine. This method handles both text
   * fragments and tag objects, transforming them into the correct events for
   * the state machine.
   *
   * For text content, it sends a simple "text" event. For tag content, it
   * creates appropriate "tag" events with the necessary attributes based on the
   * tag type ("FILESET", "FILE", or other known tags).
   *
   * @param content - The processed content piece, either text fragment or a tag
   *   object
   */
  private handlePiece(
    content: ProcessedText | ProcessedTag<ChatResponseKnownTags>
  ): void {
    if (content.type === "text") {
      this.machine.send({
        type: "text",
        text: content.text,
      });
    } else if (content.type === "tag") {
      // Create the appropriate tag event based on the tag name
      if (content.name === "FILESET") {
        if (content.kind === "open") {
          const format = (content.attributes.FORMAT ?? "complete") as
            | "complete"
            | "diff";
          this.machine.send({
            type: "tag",
            name: "FILESET",
            kind: "open",
            attributes: { FORMAT: format },
          });
        } else {
          this.machine.send({
            type: "tag",
            name: "FILESET",
            kind: "close",
          });
        }
      } else if (content.name === "FILE") {
        if (content.kind === "open") {
          if ("NAME" in content.attributes) {
            const name = content.attributes.NAME;
            this.machine.send({
              type: "tag",
              name: "FILE",
              kind: content.kind,
              attributes: { NAME: name },
            });
            // Ensure FILE open tag has the required NAME attribute
          } else {
            console.warn("FILE tag missing required NAME attribute");
          }
        } else {
          this.machine.send({
            type: "tag",
            name: "FILE",
            kind: "close",
          });
        }
      } else {
        // The remaining kinds of tags ("DIFFCHUNK", "DIFFOLD",
        // "DIFFNEW", etc.) don't have attributes.
        this.machine.send({
          type: "tag",
          name: content.name,
          kind: content.kind,
        });
      }
    }
  }

  // ===========================================================================
  // State machine event handlers
  // ===========================================================================

  private renderText(eventObj: EventText) {
    this.config.stream.markdown(eventObj.text);
  }

  private openFileset(eventObj: EventTagFilesetOpen) {
    // Default format is "complete"
    const format = eventObj.attributes.FORMAT ?? "complete";
    if (format !== "complete" && format !== "diff") {
      throw new Error(`Invalid fileset format: ${format}`);
    }

    this.fileSet = {
      format,
      files: [],
    };
  }

  private closeFileset(eventObj: EventTagFilesetClose) {
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

  private openFile(eventObj: EventTagFileOpen) {
    if (!this.fileSet) {
      throw new Error("Fileset not initialized");
    }

    // Create a mutable reference to the most recent file in this.fileSet.files.
    this.currentFile = {
      name: eventObj.attributes.NAME,
      content: "",
      type: "text",
    };

    this.fileSet.files.push(this.currentFile);

    this.fileStateHasRemovedFirstNewline = false;

    this.config.stream.markdown("\n### " + eventObj.attributes.NAME + "\n");
    this.config.stream.markdown("```");
    if (this.fileSet!.format === "diff") {
      this.config.stream.markdown("diff");
    } else {
      const fileType = inferFileType(eventObj.attributes.NAME);
      if (fileType !== "text") {
        this.config.stream.markdown(fileType);
      }
    }
    this.config.stream.markdown("\n");
  }

  private renderFileText(eventObj: EventText) {
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

  private closeFile(eventObj: EventTagFileClose) {
    this.currentFile = null;
    this.config.stream.markdown("```");
    this.config.stream.markdown("\n");
  }

  // Note that the diffs are received as XML because the LLM is better at
  // generating diffs that way, but we convert them to a format that is the same
  // as unified diffs, except there are no line numbers.
  private openDiffChunk(eventObj: EventTagDiffChunkOpen) {
    this.currentFile!.content += "@@ ... @@\n";
    this.config.stream.markdown("@@ ... @@\n");
  }

  private openDiffOld(eventObj: EventTagDiffOldOpen) {
    this.diffOldStateHasRemovedFirstNewline = false;
    this.diffOldStateLastCharWasNewline = false;
  }

  private renderDiffOldText(eventObj: EventText) {
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

  private openDiffNew(eventObj: EventTagDiffNewOpen) {
    this.diffNewStateHasRemovedFirstNewline = false;
    this.diffNewStateLastCharWasNewline = false;
  }

  private renderDiffNewText(eventObj: EventText) {
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
