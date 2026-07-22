import { glob } from "glob";
import * as path from "path";

// `import =` so esbuild emits a plain require: mocha is a CJS constructor,
// and esbuild's ESM interop namespace for `import * as` is not constructable.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import Mocha = require("mocha");

export async function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: "tdd",
    color: true,
  });

  const testsRoot = path.resolve(__dirname, "..");

  // Skip the Positron-only tests (src/test/positron/), which need a Positron
  // extension host; they're run separately via `npm run test-positron`.
  const files = await glob("**/**.test.js", {
    cwd: testsRoot,
    ignore: "positron/**",
  });
  files.forEach((f) => mocha.addFile(path.resolve(testsRoot, f)));

  // Wrap mocha.run() in a promise so the test host waits for the results;
  // otherwise it tears down immediately and failures are never reported.
  return new Promise((resolve, reject) => {
    try {
      mocha.run((failures) => {
        if (failures > 0) {
          reject(new Error(`${failures} tests failed.`));
        } else {
          resolve();
        }
      });
    } catch (err) {
      console.error(err);
      reject(err);
    }
  });
}
