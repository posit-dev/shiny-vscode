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

import { mochaCtor } from "../mocha-ctor";

export function run(): Promise<void> {
  const mocha = new mochaCtor({
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
