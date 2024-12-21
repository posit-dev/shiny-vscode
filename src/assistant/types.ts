import type { CoreMessage } from "ai";

export type FileContentJson = {
  name: string;
  content: string;
  type?: "text" | "binary";
};

// =============================================================================
// Messages from Extension to Webview
// =============================================================================
export type ExtensionToWebviewMessage =
  | ExtensionToWebviewMessageState
  | ExtensionToWebviewMessageStreamStart
  | ExtensionToWebviewMessageStreamTextDelta
  | ExtensionToWebviewMessageStreamEnd;

// The state that is sent to the webview. This is a subset of the extension
// state. In the future it might not be a strict subset; it might have some
// different information, like if the user's view of the messages is different
// from the actual messages sent to the LLM.
export type ExtensionToWebviewMessageState = {
  type: "state";
  state: {
    model: string;
    messages: Array<CoreMessage>;
    hasApiKey: boolean;
  };
};
export type ExtensionToWebviewMessageStreamStart = {
  type: "streamStart";
};
export type ExtensionToWebviewMessageStreamTextDelta = {
  type: "streamTextDelta";
  textDelta: string;
};
export type ExtensionToWebviewMessageStreamEnd = {
  type: "streamEnd";
};

// =============================================================================
// Messages from Webview to Extension
// =============================================================================
export type WebviewToExtensionMessage =
  | WebviewToExtensionMessageGetState
  | WebviewToExtensionMessageUserInput;

export type WebviewToExtensionMessageGetState = { type: "getState" };
export type WebviewToExtensionMessageUserInput = {
  type: "userInput";
  content: string;
};
