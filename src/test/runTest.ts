import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { runTests } from "@vscode/test-electron";

async function main() {
  // The folder containing the Extension Manifest package.json
  // Passed to `--extensionDevelopmentPath`
  const extensionDevelopmentPath = path.resolve(__dirname, "../../");

  // The path to test runner
  // Passed to --extensionTestsPath
  const extensionTestsPath = path.resolve(__dirname, "./suite/index");

  // Tests that write workspace-scoped settings need a folder open in the test
  // host. Use a throwaway directory so those writes never land in this repo as
  // a stray .vscode/settings.json.
  const workspacePath = fs.mkdtempSync(
    path.join(os.tmpdir(), "shiny-vscode-tests-")
  );

  try {
    // Download VS Code, unzip it and run the integration test
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [workspacePath],
    });
  } catch (err) {
    // Print the error: the reason a launch failed (a missing executable, say)
    // is otherwise invisible.
    console.error("Failed to run tests", err);
    process.exitCode = 1;
  } finally {
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
