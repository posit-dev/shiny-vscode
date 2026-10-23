import * as assert from "assert";
import * as vscode from "vscode";
import {
  activateAppDetection,
  type AppDetectionHost,
} from "../../app-contexts";

/** Short delay for detecting edits so tests don't wait long. */
const DETECT_LATER_DELAY = 10;

/** Wait for longer than `DETECT_LATER_DELAY`. */
function waitForDetectLater(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, DETECT_LATER_DELAY * 5));
}

/** A text document with only the members that app detection reads. */
function fakeDocument(
  fileName: string,
  languageId: string,
  text: string,
  scheme = "file"
): vscode.TextDocument & { text: string } {
  const document = {
    uri: vscode.Uri.from({ scheme, path: fileName }),
    fileName,
    languageId,
    text,
    getText: () => document.text,
  };
  return document as unknown as vscode.TextDocument & { text: string };
}

suite("Shiny app detection", () => {
  let subscriptions: vscode.Disposable[];
  let onDidOpen: vscode.EventEmitter<vscode.TextDocument>;
  let onDidChange: vscode.EventEmitter<vscode.TextDocumentChangeEvent>;
  let onDidClose: vscode.EventEmitter<vscode.TextDocument>;
  let host: AppDetectionHost;
  let contextValueByKey: Map<string, vscode.Uri[]>;
  let setContextCount: number;

  setup(() => {
    subscriptions = [];
    onDidOpen = new vscode.EventEmitter();
    onDidChange = new vscode.EventEmitter();
    onDidClose = new vscode.EventEmitter();
    subscriptions.push(onDidOpen, onDidChange, onDidClose);
    contextValueByKey = new Map();
    setContextCount = 0;
    host = {
      workspace: {
        textDocuments: [],
        onDidOpenTextDocument: onDidOpen.event,
        onDidChangeTextDocument: onDidChange.event,
        onDidCloseTextDocument: onDidClose.event,
      },
      setContext: (key, value) => {
        setContextCount++;
        contextValueByKey.set(key, value);
      },
    };
  });

  teardown(() => {
    subscriptions.forEach((subscription) => subscription.dispose());
  });

  /** Start app detection with already open documents. */
  function activate(...textDocuments: vscode.TextDocument[]): void {
    host.workspace = { ...host.workspace, textDocuments };
    activateAppDetection({ subscriptions }, host, DETECT_LATER_DELAY);
  }

  /** Replace a document's text and fire its change event. */
  function edit(
    document: vscode.TextDocument & { text: string },
    text: string
  ) {
    document.text = text;
    onDidChange.fire({
      document,
      contentChanges: [{} as vscode.TextDocumentContentChangeEvent],
      reason: undefined,
    });
  }

  /** The app resources context key for a language, as strings. */
  function getAppResources(language: "python" | "r"): string[] {
    const uris = contextValueByKey.get(`shiny.${language}.appResources`);
    return uris!.map((uri) => uri.toString());
  }

  test("Detect apps that are already open", () => {
    const pyApp = fakeDocument("/w/app.py", "python", "import shiny\n");

    activate(pyApp);

    assert.deepStrictEqual(getAppResources("python"), [pyApp.uri.toString()]);
    assert.deepStrictEqual(getAppResources("r"), []);
  });

  test("Clear the context keys when no apps are open", () => {
    activate();

    assert.deepStrictEqual(getAppResources("python"), []);
    assert.deepStrictEqual(getAppResources("r"), []);
  });

  test("Detect Python and R apps when they are opened", () => {
    const pyApp = fakeDocument("/w/app.py", "python", "import shiny\n");
    const rApp = fakeDocument("/w/app.R", "r", "library(shiny)\n");
    activate();

    onDidOpen.fire(pyApp);
    onDidOpen.fire(rApp);

    assert.deepStrictEqual(getAppResources("python"), [pyApp.uri.toString()]);
    assert.deepStrictEqual(getAppResources("r"), [rApp.uri.toString()]);
  });

  test("Ignore documents that are not Shiny apps", () => {
    activate();

    onDidOpen.fire(fakeDocument("/w/script.py", "python", "import shiny\n"));
    onDidOpen.fire(fakeDocument("/w/dash_app.py", "python", "import dash\n"));
    onDidOpen.fire(fakeDocument("/w/app.py", "plaintext", "import shiny\n"));

    assert.deepStrictEqual(getAppResources("python"), []);
  });

  test("Ignore apps that are not files on disk", () => {
    activate();

    onDidOpen.fire(
      fakeDocument("/w/app.py", "python", "import shiny\n", "untitled")
    );
    onDidOpen.fire(
      fakeDocument("/w/app.py", "python", "import shiny\n", "git")
    );

    assert.deepStrictEqual(getAppResources("python"), []);
  });

  test("Stop tracking an app when it is closed", () => {
    const rApp = fakeDocument("/w/app.R", "r", "library(shiny)\n");
    activate(rApp);

    onDidClose.fire(rApp);

    assert.deepStrictEqual(getAppResources("r"), []);
  });

  test("Set context keys only when the apps change", () => {
    const pyApp = fakeDocument("/w/app.py", "python", "import shiny\n");
    const script = fakeDocument("/w/script.py", "python", "import shiny\n");
    activate(pyApp);
    const initialCount = setContextCount;

    onDidOpen.fire(pyApp);
    onDidOpen.fire(script);
    onDidClose.fire(script);

    assert.strictEqual(setContextCount, initialCount);
  });

  test("Redetect an app when its language changes", () => {
    const pyApp = fakeDocument("/w/app.py", "python", "import shiny\n");
    activate(pyApp);

    // VS Code changes a document's language by closing and reopening it.
    onDidClose.fire(pyApp);
    onDidOpen.fire(fakeDocument("/w/app.py", "plaintext", "import shiny\n"));

    assert.deepStrictEqual(getAppResources("python"), []);
  });

  test("Detect an app once edits settle", async () => {
    const pyApp = fakeDocument("/w/app.py", "python", "print(1)\n");
    activate(pyApp);

    edit(pyApp, "import shiny\n");
    edit(pyApp, "import shiny\nprint(1)\n");
    assert.deepStrictEqual(getAppResources("python"), []);

    await waitForDetectLater();
    assert.deepStrictEqual(getAppResources("python"), [pyApp.uri.toString()]);
  });

  test("Skip changes that only affect the dirty state", async () => {
    const pyApp = fakeDocument("/w/app.py", "python", "print(1)\n");
    activate(pyApp);

    pyApp.text = "import shiny\n";
    onDidChange.fire({
      document: pyApp,
      contentChanges: [],
      reason: undefined,
    });

    await waitForDetectLater();
    assert.deepStrictEqual(getAppResources("python"), []);
  });

  test("Cancel a delayed detection when the document is closed", async () => {
    const pyApp = fakeDocument("/w/app.py", "python", "print(1)\n");
    activate(pyApp);

    edit(pyApp, "import shiny\n");
    onDidClose.fire(pyApp);

    await waitForDetectLater();
    assert.deepStrictEqual(getAppResources("python"), []);
  });
});
