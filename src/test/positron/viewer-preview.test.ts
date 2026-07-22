// Positron-only integration test.
//
// Exercises the Positron Viewer-pane preview surface that `openBrowser()`
// (src/net-utils.ts) uses to show a running Shiny app inside Positron:
// `positron.window.previewUrl` (via getExtensionHostPreview) and the
// `PreviewSourceType.Terminal` enum (via getPreviewSourceTypeTerminal),
// which enables the Viewer's stop button by tying the preview to the app's
// terminal process.

import * as assert from "assert";
import {
  getExtensionHostPreview,
  getPreviewSourceTypeTerminal,
} from "../../extension-api-utils/extensionHost";

suite("Positron: Viewer pane preview", () => {
  test("PreviewSourceType.Terminal is available from the Positron API", () => {
    // buildPreviewSource() (src/net-utils.ts) falls back to a hardcoded
    // "terminal" when this is undefined — if this assertion fails, the
    // Positron API shape changed and the extension's vendored typings and
    // fallback (src/types/positron.d.ts, src/net-utils.ts) need updating.
    // This already caught real drift once: the enum changed from numeric
    // (Terminal = 2) to string ("terminal") upstream.
    const terminalType = getPreviewSourceTypeTerminal();
    assert.strictEqual(
      terminalType,
      "terminal",
      "PreviewSourceType.Terminal should be exposed by the Positron API " +
        "with the wire value the extension's fallback hardcodes"
    );
  });

  test("previewUrl opens a Viewer panel", () => {
    const hostPreview = getExtensionHostPreview();
    assert.ok(
      hostPreview,
      "getExtensionHostPreview() should return a preview function in Positron"
    );

    // "about:blank" is the exact URL openBrowser() previews to clear the
    // Viewer pane before an app starts (see rRunApp in src/run.ts).
    const panel = hostPreview("about:blank");
    try {
      assert.ok(panel, "previewUrl should return a preview panel");
      assert.ok(panel.webview, "the preview panel should expose a webview");
      assert.strictEqual(typeof panel.reveal, "function");
    } finally {
      panel.dispose();
    }
  });
});
