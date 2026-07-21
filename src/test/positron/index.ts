// Mocha entry point for the Positron-only integration tests. This module is
// loaded inside the Positron extension host by
// @posit-dev/positron-test-electron (see scripts/run-positron-tests.mjs),
// which requires it and calls run().
//
// These tests are kept separate from the plain VS Code suite
// (src/test/suite/) because they exercise the Positron API, which is only
// available when the tests run inside Positron rather than vanilla VS Code.

import * as fs from "fs";
import * as path from "path";

// `import =` so esbuild emits a plain require: mocha is a CJS constructor,
// and esbuild's ESM interop namespace for `import * as` is not constructable.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import Mocha = require("mocha");

export function run(): Promise<void> {
  const mocha = new Mocha({
    ui: "tdd",
    color: true,
    // Extension activation on a cold CI machine can be slow, so give each
    // test a generous ceiling.
    timeout: 120000,
  });

  const testsRoot = __dirname;
  for (const file of fs.readdirSync(testsRoot)) {
    if (file.endsWith(".test.js")) {
      mocha.addFile(path.resolve(testsRoot, file));
    }
  }

  return new Promise((resolve, reject) => {
    try {
      mocha.run((failures) => {
        if (failures > 0) {
          reject(new Error(`${failures} test(s) failed.`));
        } else {
          resolve();
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}
