import { glob } from "glob";
import * as path from "path";

// `import =` so esbuild emits a plain require: mocha is CJS, and esbuild's
// ESM interop namespace for `import * as` is not constructable.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import MochaModule = require("mocha");

// mocha 10 exported the Mocha class as `module.exports` itself; mocha 12
// exports an ESM-style namespace with the class on `.Mocha`/`.default`.
// @types/mocha still declares the old `export =` shape, hence the cast.
const MochaCtor =
  typeof MochaModule === "function"
    ? MochaModule
    : ((MochaModule as unknown as { Mocha?: typeof MochaModule }).Mocha ??
      (MochaModule as unknown as { default: typeof MochaModule }).default);

export async function run(): Promise<void> {
  // Create the mocha test
  const mocha = new MochaCtor({
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
