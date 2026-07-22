// Positron-only integration test.
//
// Verifies the cross-extension wiring between this extension and Positron's
// bundled positron-run-app extension. `rRunApp()` (src/run.ts) calls
// `getPositronRunAppApi()` to decide whether to run a Shiny for R app in
// Positron's console (via `runApplicationInConsole`) or fall back to a
// terminal — wiring that doesn't exist in vanilla VS Code, so the plain
// suite can't cover it.

import * as assert from "assert";
import * as vscode from "vscode";
import { getPositronRunAppApi } from "../../extension-api-utils/extensionHost";

suite("Positron: positron-run-app API", () => {
  test("Positron bundles the positron-run-app extension", () => {
    const ext = vscode.extensions.getExtension("positron.positron-run-app");
    assert.ok(
      ext,
      "positron.positron-run-app should be present in the extension host"
    );
  });

  test("getPositronRunAppApi() resolves an API with runApplicationInConsole", async () => {
    // This is the exact gate rRunApp() uses: if this returns undefined, the
    // extension silently falls back to running R in a terminal instead of
    // Positron's console.
    const api = await getPositronRunAppApi();
    assert.ok(
      api,
      "getPositronRunAppApi() should return the positron-run-app API"
    );
    assert.strictEqual(
      typeof api.runApplicationInConsole,
      "function",
      "the positron-run-app API should support runApplicationInConsole"
    );
  });
});
