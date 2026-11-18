import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";

interface Manifest {
  contributes: {
    commands: { command: string; enablement?: string }[];
    menus: { commandPalette: { command: string; when: string }[] };
  };
}

const manifest = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../../package.json"), "utf8"),
) as Manifest;

suite("Manifest run/debug command gating (#130)", () => {
  const expected: [string, string][] = [
    ["shiny.python.runApp", "editorLangId == python"],
    ["shiny.python.debugApp", "editorLangId == python"],
    ["shiny.r.runApp", "editorLangId == r"],
  ];

  for (const [command, palette] of expected) {
    test(`${command} is not gated on the active editor language`, () => {
      const entry = manifest.contributes.commands.find(
        (c) => c.command === command,
      );
      assert.strictEqual(entry?.enablement, "shellExecutionSupported");
    });

    test(`${command} is limited to ${palette} in the command palette`, () => {
      const entry = manifest.contributes.menus.commandPalette.find(
        (c) => c.command === command,
      );
      assert.strictEqual(entry?.when, palette);
    });
  }
});
