import { runTests, runVSCodeCommand } from "@vscode/test-electron";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const vsix = process.argv[2];
if (!vsix)
  throw new Error("Usage: node scripts/test-vsix.mjs <extension.vsix>");
if (!process.env.SHINY_TEST_PYTHON)
  throw new Error(
    "Set SHINY_TEST_PYTHON to an interpreter providing shiny.validate; selected-interpreter coverage is required."
  );
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
  const pythonExtensions = path.join(temporary, "python-extensions");
  await runVSCodeCommand([
    "--install-extension",
    "ms-python.python",
    "--extensions-dir",
    pythonExtensions,
    "--user-data-dir",
    path.join(temporary, "install-profile"),
  ]);
  for (const [index, [missing, selectedPython]] of [
    ["", false],
    ["out/parsers/tree-sitter-python.wasm", false],
    ["out/parsers/tree-sitter-r.wasm", false],
    ["node_modules/web-tree-sitter/web-tree-sitter.wasm", false],
    ["", true],
    ["node_modules/web-tree-sitter/web-tree-sitter.wasm", true],
  ].entries()) {
    const scenario = path.join(temporary, String(index));
    const extension = path.join(scenario, "extension");
    fs.cpSync(packaged, extension, { recursive: true });
    if (missing) fs.unlinkSync(path.join(extension, missing));
    console.log(
      `Testing VSIX: ${selectedPython ? "selected Python, " : "fallback, "}${missing ? `missing ${missing}` : "complete package"}`
    );
    const workspace = path.join(scenario, "workspace");
    fs.mkdirSync(workspace);
    await runTests({
      extensionDevelopmentPath: extension,
      extensionTestsPath: path.join(root, "out/test/packaged/index.js"),
      extensionTestsEnv: {
        SHINY_TEST_MISSING_PARSER: missing,
        SHINY_TEST_SELECTED_PYTHON: selectedPython ? "1" : "",
      },
      launchArgs: [
        workspace,
        "--user-data-dir",
        path.join(scenario, "user-data"),
        "--extensions-dir",
        selectedPython ? pythonExtensions : path.join(scenario, "extensions"),
        "--skip-welcome",
        "--skip-release-notes",
      ],
    });
  }
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
