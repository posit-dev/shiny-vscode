import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

/**
 * Integration tests for #130: run/debug commands must refuse a file of the
 * wrong language, whether it arrives as an explicit `uri` (Uri or string) or
 * from the active editor, and must never start a terminal or debug session.
 *
 * The commands are the ones the extension registered. We observe
 * `showErrorMessage` (stubbed so no toast blocks) and `startDebugging`
 * (stubbed so no real debug launch), and watch terminals via a real event.
 * A wrong-language call must fail with the *specific* gating message, so a
 * missing Python extension (which also starts nothing) can't mask a regression.
 */

const PY_MESSAGE =
  "Cannot run Shiny app: the selected file must be a Python file.";
const R_MESSAGE =
  "Cannot run Shiny app: the selected file must be an R file.";

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

suite("Run/debug language gating (#130)", () => {
  let tmpDir: string;
  let pyFile: string;
  let rFile: string;
  let disposables: vscode.Disposable[];
  let openedTerminals: vscode.Terminal[];
  let startedDebugSessions: vscode.DebugSession[];
  let errorMessages: string[];
  let startDebuggingCalls: unknown[][];
  let restore: Array<() => void>;

  /** Replace a property on a `vscode` namespace, failing loudly if frozen. */
  function stub<T extends object, K extends keyof T>(
    target: T,
    key: K,
    value: T[K]
  ): void {
    const original = target[key];
    try {
      (target as Mutable<T>)[key] = value;
    } catch (e) {
      assert.fail(`cannot stub ${String(key)}: ${e}`);
    }
    assert.strictEqual(
      target[key],
      value,
      `stub of ${String(key)} not applied`
    );
    restore.push(() => {
      (target as Mutable<T>)[key] = original;
    });
  }

  suiteSetup(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiny-gating-"));
    // Separate directories: the terminal's cwd identifies which file ran.
    fs.mkdirSync(path.join(tmpDir, "py"));
    fs.mkdirSync(path.join(tmpDir, "r"));
    pyFile = path.join(tmpDir, "py", "app.py");
    rFile = path.join(tmpDir, "r", "app.R");
    fs.writeFileSync(
      pyFile,
      "from shiny import App, ui\napp = App(ui.page_fluid(), None)\n"
    );
    fs.writeFileSync(
      rFile,
      "library(shiny)\nshinyApp(fluidPage(), function(input, output) {})\n"
    );
    const ext = vscode.extensions.all.find(
      (e) => e.packageJSON?.name === "shiny"
    );
    assert.ok(ext, "extension under test should be installed");
    await ext.activate();
  });

  suiteTeardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  setup(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    restore = [];
    openedTerminals = [];
    startedDebugSessions = [];
    errorMessages = [];
    startDebuggingCalls = [];
    disposables = [
      vscode.window.onDidOpenTerminal((t) => openedTerminals.push(t)),
      vscode.debug.onDidStartDebugSession((s) => startedDebugSessions.push(s)),
    ];
    stub(vscode.window, "showErrorMessage", ((message: string) => {
      errorMessages.push(message);
      return Promise.resolve(undefined);
    }) as typeof vscode.window.showErrorMessage);
    stub(vscode.debug, "startDebugging", ((...args: unknown[]) => {
      startDebuggingCalls.push(args);
      return Promise.resolve(false);
    }) as typeof vscode.debug.startDebugging);
  });

  teardown(async () => {
    restore.reverse().forEach((r) => r());
    disposables.forEach((d) => d.dispose());
    openedTerminals.forEach((t) => t.dispose());
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  async function activate(file: string): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    await vscode.window.showTextDocument(doc);
    assert.strictEqual(
      vscode.window.activeTextEditor?.document.uri.fsPath,
      file
    );
  }

  /** Run a command that must refuse: it resolves, with exactly this error. */
  async function assertRefused(
    expected: string | RegExp,
    command: string,
    ...args: unknown[]
  ): Promise<void> {
    await vscode.commands.executeCommand(command, ...args);
    assert.strictEqual(errorMessages.length, 1, `errors: ${errorMessages}`);
    if (typeof expected === "string") {
      assert.strictEqual(errorMessages[0], expected);
    } else {
      assert.match(errorMessages[0], expected);
    }
    assert.deepStrictEqual(
      openedTerminals.map((t) => t.name),
      [],
      "no terminal should be created"
    );
    assert.deepStrictEqual(
      startDebuggingCalls,
      [],
      "startDebugging not called"
    );
    assert.deepStrictEqual(
      startedDebugSessions,
      [],
      "no debug session started"
    );
  }

  test("commands are registered", async () => {
    const commands = await vscode.commands.getCommands(true);
    for (const c of [
      "shiny.python.runApp",
      "shiny.python.debugApp",
      "shiny.r.runApp",
    ]) {
      assert.ok(commands.includes(c), `${c} should be registered`);
    }
  });

  const cases = [
    {
      command: "shiny.python.runApp",
      message: PY_MESSAGE,
      wrong: () => rFile,
      right: () => pyFile,
    },
    {
      command: "shiny.python.debugApp",
      message: PY_MESSAGE,
      wrong: () => rFile,
      right: () => pyFile,
    },
    {
      command: "shiny.r.runApp",
      message: R_MESSAGE,
      wrong: () => pyFile,
      right: () => rFile,
    },
  ];

  for (const { command, message, wrong, right } of cases) {
    test(`${command} refuses a wrong-language vscode.Uri`, async () => {
      await assertRefused(message, command, vscode.Uri.file(wrong()));
    });

    test(`${command} refuses a wrong-language string URI`, async () => {
      await assertRefused(
        message,
        command,
        vscode.Uri.file(wrong()).toString()
      );
    });

    test(`${command} refuses a wrong-language active editor`, async () => {
      await activate(wrong());
      await assertRefused(message, command);
    });

    test(`${command} does not fall back to a right-language active editor when given a wrong-language uri`, async () => {
      await activate(right());
      await assertRefused(message, command, vscode.Uri.file(wrong()));
    });
  }

  // Intercept terminal creation to verify the selected file without launching
  // R or leaving an app startup wait in the background.
  async function cwdForValidR(
    arg: vscode.Uri | string | undefined
  ): Promise<string | undefined> {
    const stopped = new Error("terminal creation intercepted");
    let options: vscode.TerminalOptions | undefined;
    stub(
      vscode.window,
      "createTerminal",
      ((terminalOptions: vscode.TerminalOptions) => {
        options = terminalOptions;
        throw stopped;
      }) as typeof vscode.window.createTerminal
    );

    await assert.rejects(
      Promise.resolve(vscode.commands.executeCommand("shiny.r.runApp", arg)),
      (error: unknown) => error === stopped
    );
    assert.strictEqual(errorMessages.length, 0);
    assert.strictEqual(options?.name, "Shiny");
    return options?.cwd?.toString();
  }

  test("shiny.r.runApp prepares a valid R string URI over a Python active editor", async () => {
    await activate(pyFile);
    const cwd = await cwdForValidR(vscode.Uri.file(rFile).toString());
    assert.strictEqual(cwd, path.dirname(rFile));
  });

  test("shiny.r.runApp prepares a valid R vscode.Uri over a Python active editor", async () => {
    await activate(pyFile);
    const cwd = await cwdForValidR(vscode.Uri.file(rFile));
    assert.strictEqual(cwd, path.dirname(rFile));
  });

  test("shiny.r.runApp falls back to a valid R active editor", async () => {
    await activate(rFile);
    const cwd = await cwdForValidR(undefined);
    assert.strictEqual(cwd, path.dirname(rFile));
  });

  test("R console receives the requested document, not the active editor", async () => {
    await activate(pyFile);
    let selected: vscode.TextDocument | undefined;
    const fakeApi = {
      async runApplicationInConsole(options: {
        document: vscode.TextDocument;
      }) {
        selected = options.document;
      },
    };
    const getExtension = vscode.extensions.getExtension;
    stub(vscode.extensions, "getExtension", ((id: string) =>
      id === "positron.positron-run-app"
        ? { isActive: true, exports: fakeApi }
        : getExtension(id)) as typeof vscode.extensions.getExtension);

    await vscode.commands.executeCommand(
      "shiny.r.runApp",
      vscode.Uri.file(rFile)
    );
    assert.strictEqual(selected?.uri.fsPath, rFile);
    assert.deepStrictEqual(errorMessages, []);
  });

  test("R console refuses a different file selected by older Positron", async () => {
    await activate(pyFile);
    let code: unknown;
    const fakeApi = {
      async runApplicationInConsole(options: {
        getConsoleCode: (
          runtime: undefined,
          document: vscode.TextDocument
        ) => Promise<unknown>;
      }) {
        code = await options.getConsoleCode(
          undefined,
          vscode.window.activeTextEditor!.document
        );
      },
    };
    const getExtension = vscode.extensions.getExtension;
    stub(vscode.extensions, "getExtension", ((id: string) =>
      id === "positron.positron-run-app"
        ? { isActive: true, exports: fakeApi }
        : getExtension(id)) as typeof vscode.extensions.getExtension);

    await vscode.commands.executeCommand(
      "shiny.r.runApp",
      vscode.Uri.file(rFile)
    );
    assert.strictEqual(code, undefined);
    assert.deepStrictEqual(errorMessages, [
      "Cannot run Shiny app: Positron selected a different file. Update Positron and try again.",
    ]);
  });
});
