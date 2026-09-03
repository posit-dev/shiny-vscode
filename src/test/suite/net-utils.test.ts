import * as assert from "assert";
import * as vscode from "vscode";
import { configShinyTimeoutOpenBrowserForPositronConsole } from "../../net-utils";

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
