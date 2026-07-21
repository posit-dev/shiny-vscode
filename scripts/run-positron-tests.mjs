// Launcher for the Positron-only integration tests (src/test/positron/).
//
// Downloads (or reuses a cached) Positron build and runs the compiled Mocha
// entry point (out/test/positron/index.js) inside it, via
// @posit-dev/positron-test-electron.
//
// Run with `npm run test-positron` (which builds the extension and tests
// first). Set POSITRON_CHANNEL=daily to test against a daily Positron build
// (default: stable).
//
// NOTE: @posit-dev/positron-test-electron currently supports macOS only;
// Windows/Linux support is planned upstream.

import { runTests } from "@posit-dev/positron-test-electron";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  // Extension root (contains package.json); scripts/ lives one level below it.
  const extensionDevelopmentPath = path.resolve(__dirname, "..");

  // Compiled Mocha entry point that discovers and runs the Positron tests.
  const extensionTestsPath = path.resolve(
    extensionDevelopmentPath,
    "out",
    "test",
    "positron",
    "index.js"
  );

  const code = await runTests({
    channel: process.env.POSITRON_CHANNEL === "daily" ? "daily" : "stable",
    extensionDevelopmentPath,
    extensionTestsPath,
    // The run-app and viewer tests exercise Positron's bundled
    // positron-run-app extension, so opt out of the default
    // --disable-extensions.
    disableExtensions: false,
  });

  process.exit(code);
}

main().catch((err) => {
  console.error("Failed to run Positron integration tests:");
  console.error(err);
  process.exit(1);
});
