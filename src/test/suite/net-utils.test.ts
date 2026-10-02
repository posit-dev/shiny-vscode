import * as assert from "assert";
import * as vscode from "vscode";
import {
  appStatusFileMessage,
  configShinyTimeoutOpenBrowserForPositronConsole,
} from "../../net-utils";

const SETTING = "shiny.timeoutOpenBrowser";

suite("configShinyTimeoutOpenBrowserForPositronConsole", () => {
  suiteSetup(() => {
    // The workspace-scope tests below cannot write their setting without an
    // open folder. runTest.ts opens a throwaway one; fail loudly rather than
    // reporting a confusing write error if that ever stops happening.
    assert.ok(
      vscode.workspace.workspaceFolders?.length,
      "these tests need a workspace folder open; see src/test/runTest.ts"
    );
  });

  teardown(async () => {
    const config = vscode.workspace.getConfiguration();
    await config.update(SETTING, undefined, vscode.ConfigurationTarget.Global);
    await config.update(
      SETTING,
      undefined,
      vscode.ConfigurationTarget.Workspace
    );
  });

  test("returns undefined when the user has not set the timeout", () => {
    // The setting has a default of 10 in package.json. Returning that default
    // would silently override positron.runApp.urlDetectionTimeout, so an unset
    // setting must defer instead.
    assert.strictEqual(
      configShinyTimeoutOpenBrowserForPositronConsole(),
      undefined
    );
  });

  test("returns the user's timeout, in milliseconds, when it is set", async () => {
    await vscode.workspace
      .getConfiguration()
      .update(SETTING, 60, vscode.ConfigurationTarget.Global);

    assert.strictEqual(
      configShinyTimeoutOpenBrowserForPositronConsole(),
      60_000
    );
  });

  test("returns the default value when the user sets it explicitly", async () => {
    // Setting it to the same number as the default is still a choice, so we
    // honor it rather than treating it as unset.
    await vscode.workspace
      .getConfiguration()
      .update(SETTING, 10, vscode.ConfigurationTarget.Global);

    assert.strictEqual(
      configShinyTimeoutOpenBrowserForPositronConsole(),
      10_000
    );
  });

  test("prefers the workspace value over the global value", async () => {
    // Scope precedence is the part of the lookup that inspect() forces us to
    // reimplement by hand, so pin it down: a workspace value must win.
    const config = vscode.workspace.getConfiguration();
    await config.update(SETTING, 60, vscode.ConfigurationTarget.Global);
    await config.update(SETTING, 45, vscode.ConfigurationTarget.Workspace);

    assert.strictEqual(
      configShinyTimeoutOpenBrowserForPositronConsole(),
      45_000
    );
  });

  test("returns the workspace value when only the workspace sets it", async () => {
    await vscode.workspace
      .getConfiguration()
      .update(SETTING, 30, vscode.ConfigurationTarget.Workspace);

    assert.strictEqual(
      configShinyTimeoutOpenBrowserForPositronConsole(),
      30_000
    );
  });
});

suite("appStatusFileMessage", () => {
  test("surfaces the launcher's error message", () => {
    assert.strictEqual(
      appStatusFileMessage("error\nobject 'broken_title' not found\n"),
      "Shiny app failed to start: object 'broken_title' not found"
    );
  });

  test("flattens multi-line error details into one line", () => {
    assert.strictEqual(
      appStatusFileMessage("error\nfirst line\nsecond line"),
      "Shiny app failed to start: first line second line"
    );
  });

  test("handles an error status with no details", () => {
    assert.strictEqual(
      appStatusFileMessage("error"),
      "Shiny app failed to start."
    );
  });

  test("strips ANSI styling from the launcher's error message", () => {
    assert.strictEqual(
      appStatusFileMessage(
        "error\n\x1B[1m\x1B[22mI haven't built that yet. \x1B[36m\u2139\x1B[39m but I will one day!\n"
      ),
      "Shiny app failed to start: I haven't built that yet. \u2139 but I will one day!"
    );
  });

  test("strips ANSI hyperlinks from the launcher's error message", () => {
    assert.strictEqual(
      appStatusFileMessage(
        "error\nfailed: \x1B]8;;https://example.com\x1B\\docs\x1B]8;;\x1B\\\\\n"
      ),
      "Shiny app failed to start: failed: docs"
    );
  });

  test("caps long error details for the notification", () => {
    const message = appStatusFileMessage(`error\n${"a".repeat(500)}`);
    assert.ok(
      message.startsWith(`Shiny app failed to start: ${"a".repeat(300)}`)
    );
    assert.ok(message.endsWith("…"));
  });

  test("does not truncate error details at the cap boundary", () => {
    const details = "a".repeat(300);
    assert.strictEqual(
      appStatusFileMessage(`error\n${details}`),
      `Shiny app failed to start: ${details}`
    );
  });

  test("explains plain exits without blaming an error", () => {
    assert.strictEqual(
      appStatusFileMessage("exited"),
      "Shiny app exited before it finished starting, so we have not opened the preview."
    );
  });
});
