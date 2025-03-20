// Copyright (C) 2025 by Posit Software, PBC.

// This is the portion of the Positron API definition used by this extension,
// here until it is published.

// From https://github.com/posit-dev/positron/blob/2a33b2fe421adb799351960f6d05603594c11acc/src/positron-dts/positron.d.ts

declare module "positron" {
  /**
   * LanguageRuntimeMetadata contains information about a language runtime that is known
   * before the runtime is started.
   */
  export interface LanguageRuntimeMetadata {
    /** The path to the runtime. */
    runtimePath: string;

    /** A unique identifier for this runtime; takes the form of a GUID */
    runtimeId: string;

    /**
     * The fully qualified name of the runtime displayed to the user; e.g. "R 4.2 (64-bit)".
     * Should be unique across languages.
     */
    runtimeName: string;

    /**
     * A language specific runtime name displayed to the user; e.g. "4.2 (64-bit)".
     * Should be unique within a single language.
     */
    runtimeShortName: string;

    /** The version of the runtime itself (e.g. kernel or extension version) as a string; e.g. "0.1" */
    runtimeVersion: string;

    /** The runtime's source or origin; e.g. PyEnv, System, Homebrew, Conda, etc. */
    runtimeSource: string;

    /** The free-form, user-friendly name of the language this runtime can execute; e.g. "R" */
    languageName: string;

    /**
     * The Visual Studio Code Language ID of the language this runtime can execute; e.g. "r"
     *
     * See here for a list of known language IDs:
     * https://code.visualstudio.com/docs/languages/identifiers#_known-language-identifiers
     */
    languageId: string;

    /** The version of the language; e.g. "4.2" */
    languageVersion: string;

    /** The Base64-encoded icon SVG for the language. */
    base64EncodedIconSvg: string | undefined;

    /** Whether the runtime should start up automatically or wait until explicitly requested */
    startupBehavior: LanguageRuntimeStartupBehavior;

    /** Where sessions will be located; used as a hint to control session restoration */
    sessionLocation: LanguageRuntimeSessionLocation;

    /**
     * Extra data supplied by the runtime provider; not read by Positron but supplied
     * when creating a new session from the metadata.
     */
    extraRuntimeData: any;
  }

  namespace window {
    /**
     * Create and show a new preview panel.
     *
     * @param viewType Identifies the type of the preview panel.
     * @param title Title of the panel.
     * @param options Settings for the new panel.
     *
     * @return New preview panel.
     */
    export function createPreviewPanel(
      viewType: string,
      title: string,
      preserveFocus?: boolean,
      options?: PreviewOptions
    ): PreviewPanel;

    /**
     * Create and show a new preview panel for a URL. This is a convenience
     * method that creates a new webview panel and sets its content to the
     * given URL.
     *
     * @param url The URL to preview
     *
     * @return New preview panel.
     */
    export function previewUrl(url: vscode.Uri): PreviewPanel;

    /**
     * Create and show a new preview panel for an HTML file. This is a
     * convenience method that creates a new webview panel and sets its
     * content to that of the given file.
     *
     * @param path The fully qualified path to the HTML file to preview
     *
     * @return New preview panel.
     */
    export function previewHtml(path: string): PreviewPanel;

    /**
     * Create a log output channel from raw data.
     *
     * Variant of `createOutputChannel()` that creates a "raw log" output channel.
     * Compared to a normal `LogOutputChannel`, this doesn't add timestamps or info
     * level. It's meant for extensions that create fully formed log lines but still
     * want to benefit from the colourised rendering of log output channels.
     *
     * @param name Human-readable string which will be used to represent the channel in the UI.
     *
     * @return New log output channel.
     */
    export function createRawLogOutputChannel(
      name: string
    ): vscode.OutputChannel;

    /**
     * Create and show a simple modal dialog prompt.
     *
     * @param title The title of the dialog
     * @param message The message to display in the dialog
     * @param okButtonTitle The title of the OK button (optional; defaults to 'OK')
     * @param cancelButtonTitle The title of the Cancel button (optional; defaults to 'Cancel')
     *
     * @returns A Thenable that resolves to true if the user clicked OK, or false
     *   if the user clicked Cancel.
     */
    export function showSimpleModalDialogPrompt(
      title: string,
      message: string,
      okButtonTitle?: string,
      cancelButtonTitle?: string
    ): Thenable<boolean>;

    /**
     * Create and show a different simple modal dialog prompt.
     *
     * @param title The title of the dialog
     * @param message The message to display in the dialog
     * @param okButtonTitle The title of the OK button (optional; defaults to 'OK')
     *
     * @returns A Thenable that resolves when the user clicks OK.
     */
    export function showSimpleModalDialogMessage(
      title: string,
      message: string,
      okButtonTitle?: string
    ): Thenable<null>;

    /**
     * Get the `Console` for a runtime language `id`
     *
     * @param id The runtime language `id` to retrieve a `Console` for, i.e. 'r' or 'python'.
     *
     * @returns A `Console`, or `undefined` if no `Console` for that language exists.
     */
    export function getConsoleForLanguage(id: string): Console | undefined;

    /**
     * Fires when the width of the console input changes. The new width is passed as
     * a number, which represents the number of characters that can fit in the
     * console horizontally.
     */
    export const onDidChangeConsoleWidth: vscode.Event<number>;

    /**
     * Returns the current width of the console input, in characters.
     */
    export function getConsoleWidth(): Thenable<number>;
  }

  namespace runtime {
    /**
     * Executes code in a language runtime's console, as though it were typed
     * interactively by the user.
     *
     * @param languageId The language ID of the code snippet
     * @param code The code snippet to execute
     * @param focus Whether to focus the runtime's console
     * @param allowIncomplete Whether to bypass runtime code completeness checks. If true, the `code`
     *   will be executed by the runtime even if it is incomplete or invalid. Defaults to false
     * @param mode Possible code execution mode for a language runtime
     * @param errorBehavior Possible error behavior for a language runtime, currently ignored by kernels
     * @returns A Thenable that resolves with true if the code was sent to a
     *   runtime successfully, false otherwise.
     */
    export function executeCode(
      languageId: string,
      code: string,
      focus: boolean,
      allowIncomplete?: boolean,
      mode?: RuntimeCodeExecutionMode,
      errorBehavior?: RuntimeErrorBehavior
    ): Thenable<boolean>;

    /**
     * Register a language runtime manager with Positron.
     *
     * @param languageId The language ID for which the runtime
     * @returns A disposable that unregisters the manager when disposed.
     *
     */
    export function registerLanguageRuntimeManager(
      languageId: string,
      manager: LanguageRuntimeManager
    ): vscode.Disposable;

    /**
     * List all registered runtimes.
     */
    export function getRegisteredRuntimes(): Thenable<
      LanguageRuntimeMetadata[]
    >;

    /**
     * Get the preferred language runtime for a given language.
     *
     * @param languageId The language ID of the preferred runtime
     */
    export function getPreferredRuntime(
      languageId: string
    ): Thenable<LanguageRuntimeMetadata>;

    /**
     * Get the active foreground session, if any.
     */
    export function getForegroundSession(): Thenable<
      LanguageRuntimeSession | undefined
    >;

    /**
     * Get the session corresponding to a notebook, if any.
     *
     * @param notebookUri The URI of the notebook.
     */
    export function getNotebookSession(
      notebookUri: vscode.Uri
    ): Thenable<LanguageRuntimeSession | undefined>;

    /**
     * Select and start a runtime previously registered with Positron. Any
     * previously active runtimes for the language will be shut down.
     *
     * @param runtimeId The ID of the runtime to select and start.
     */
    export function selectLanguageRuntime(runtimeId: string): Thenable<void>;

    /**
     * Start a new session for a runtime previously registered with Positron.
     *
     * @param runtimeId The ID of the runtime to select and start.
     * @param sessionName A human-readable name for the new session.
     * @param notebookUri If the session is associated with a notebook,
     *   the notebook URI.
     *
     * Returns a Thenable that resolves with the newly created session.
     */
    export function startLanguageRuntime(
      runtimeId: string,
      sessionName: string,
      notebookUri?: vscode.Uri
    ): Thenable<LanguageRuntimeSession>;

    /**
     * Restart a running session.
     *
     * @param sessionId The ID of the session to restart.
     */
    export function restartSession(sessionId: string): Thenable<void>;

    /**
     * Register a handler for runtime client instances. This handler will be called
     * whenever a new client instance is created by a language runtime of the given
     * type.
     *
     * @param handler A handler for runtime client instances
     */
    export function registerClientHandler(
      handler: RuntimeClientHandler
    ): vscode.Disposable;

    /**
     * Register a runtime client instance. Registering the instance
     * indicates that the caller has ownership of the instance, and that
     * messages the instance receives do not need to be forwarded to the
     * Positron core.
     */
    export function registerClientInstance(
      clientInstanceId: string
    ): vscode.Disposable;

    /**
     * An event that fires when a new runtime is registered.
     */
    export const onDidRegisterRuntime: vscode.Event<LanguageRuntimeMetadata>;

    /**
     * An event that fires when the foreground session changes
     */
    export const onDidChangeForegroundSession: vscode.Event<string | undefined>;
  }
}
