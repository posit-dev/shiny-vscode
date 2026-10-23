import { runTests } from "@vscode/test-electron";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const vsix = process.argv[2];
if (!vsix)
  throw new Error("Usage: node scripts/test-vsix.mjs <extension.vsix>");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Keep macOS's extension-host socket path below its length limit.
const temporary = fs.mkdtempSync(
  path.join(process.platform === "darwin" ? "/tmp" : os.tmpdir(), "shiny-vsix-")
);
try {
  execFileSync("unzip", [
    "-q",
    path.resolve(vsix),
    "-d",
    path.join(temporary, "package"),
  ]);
  const packaged = path.join(temporary, "package/extension");
  for (const [index, missing] of [
    "",
    "out/parsers/tree-sitter-python.wasm",
    "out/parsers/tree-sitter-r.wasm",
    "node_modules/web-tree-sitter/web-tree-sitter.wasm",
  ].entries()) {
    const scenario = path.join(temporary, String(index));
    const extension = path.join(scenario, "extension");
    fs.cpSync(packaged, extension, { recursive: true });
    if (missing) fs.unlinkSync(path.join(extension, missing));
    console.log(
      `Testing VSIX: ${missing ? `missing ${missing}` : "complete package"}`
    );
    await runTests({
      extensionDevelopmentPath: extension,
      extensionTestsPath: path.join(root, "out/test/packaged/index.js"),
      extensionTestsEnv: { SHINY_TEST_MISSING_PARSER: missing },
      launchArgs: [
        "--user-data-dir",
        path.join(scenario, "user-data"),
        "--extensions-dir",
        path.join(scenario, "extensions"),
        "--skip-welcome",
        "--skip-release-notes",
      ],
    });
  }
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
