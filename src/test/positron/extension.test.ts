// Positron-only integration test.
//
// Sanity checks for the contract this extension depends on when running
// inside Positron: the extension host injects an `acquirePositronApi` global
// (which the extension feature-detects Positron with — see
// src/extension-api-utils/extensionHost.ts), and the Shiny extension
// activates in the Positron extension host.

import * as assert from "assert";
import * as vscode from "vscode";
import {
  getIdeName,
  isPositron,
} from "../../extension-api-utils/extensionHost";

suite("Positron: extension host", () => {
  test("Positron injects the acquirePositronApi global", () => {
    assert.strictEqual(
      typeof acquirePositronApi,
      "function",
      "the extension host should provide the acquirePositronApi global"
    );

    const api = acquirePositronApi();
    assert.ok(api, "acquirePositronApi() should return the Positron API");
    assert.strictEqual(typeof api.version, "string");
    assert.ok(
      api.version.length > 0,
      "the Positron API should report a version"
    );
  });

  test("the extension's own feature detection recognizes Positron", () => {
    // These are the helpers the extension uses everywhere to branch between
    // Positron and VS Code behavior (Viewer pane vs. Simple Browser, console
    // vs. terminal, etc.).
    assert.strictEqual(isPositron(), true);
    assert.strictEqual(getIdeName(), "Positron");
  });

  test("the Shiny extension activates in Positron", async () => {
    const shiny = vscode.extensions.getExtension("posit.shiny");
    assert.ok(shiny, "posit.shiny should be present in the extension host");

    await shiny.activate();
    assert.ok(shiny.isActive, "Shiny should activate without error");
  });
});
