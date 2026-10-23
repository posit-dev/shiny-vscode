import * as assert from "assert";
import * as fs from "fs/promises";
import * as lzstring from "lz-string";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { handlePositShinyUri } from "../../extension-onUri";
import {
  shinyliveCreateFromExplorer,
  shinyliveSaveAppFromUrl,
  shinyliveUrlDecode,
} from "../../shinylive";

function linkForJson(json: string, header = "h=0&"): string {
  return `https://shinylive.io/py/editor/#${header}code=${lzstring.compressToEncodedURIComponent(json)}`;
}

const appFiles = [{ name: "app.py", content: "from shiny import App\n" }];

suite("Shinylive links", () => {
  const restore: (() => void)[] = [];

  // Replace only user-interaction boundaries; URI parsing and file I/O remain real.
  function stub(object: object, key: string, value: unknown): void {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    Object.defineProperty(object, key, { configurable: true, value });
    restore.push(() => {
      if (descriptor) {
        Object.defineProperty(object, key, descriptor);
      } else {
        Reflect.deleteProperty(object, key);
      }
    });
  }

  teardown(() => {
    restore
      .splice(0)
      .reverse()
      .forEach((undo) => undo());
  });

  test("Repeated single-file save cancellation leaves no default directory without a workspace", async () => {
    stub(vscode.workspace, "workspaceFolders", undefined);
    const options: vscode.SaveDialogOptions[] = [];
    stub(
      vscode.window,
      "showSaveDialog",
      async (value: vscode.SaveDialogOptions) => {
        options.push(value);
        return undefined;
      }
    );
    const url = linkForJson(JSON.stringify(appFiles));

    await shinyliveSaveAppFromUrl(url);
    await shinyliveSaveAppFromUrl(url);

    assert.strictEqual(options.length, 2, "Both save dialogs must be reached");
    assert.deepStrictEqual(
      options.map((option) => option.defaultUri),
      [undefined, undefined]
    );
    // eslint-disable-next-line @typescript-eslint/naming-convention
    assert.deepStrictEqual(options[0].filters, { Python: ["py"] });
  });

  test("Repeated multi-file save cancellation leaves no default directory without a workspace", async () => {
    stub(vscode.workspace, "workspaceFolders", undefined);
    const options: vscode.SaveDialogOptions[] = [];
    stub(
      vscode.window,
      "showSaveDialog",
      async (value: vscode.SaveDialogOptions) => {
        options.push(value);
        return undefined;
      }
    );
    const url = linkForJson(
      JSON.stringify([...appFiles, { name: "data.txt", content: "data" }])
    );

    await shinyliveSaveAppFromUrl(url);
    await shinyliveSaveAppFromUrl(url);

    assert.strictEqual(options.length, 2, "Both save dialogs must be reached");
    assert.deepStrictEqual(
      options.map((option) => option.defaultUri),
      [undefined, undefined]
    );
  });

  for (const header of ["", "h=0&"]) {
    test(`Decodes a valid link with ${header ? "a hidden" : "the default"} header`, () => {
      const files = [
        ...appFiles,
        { name: "data/../data/example.txt", content: "é + %26 &" },
        { name: "image.bin", content: "AP+A", type: "binary" },
      ];
      const bundle = shinyliveUrlDecode(
        linkForJson(JSON.stringify(files), header)
      );

      assert.deepStrictEqual(bundle, {
        language: "py",
        mode: "editor",
        files: [
          appFiles[0],
          { name: path.join("data", "example.txt"), content: "é + %26 &" },
          files[2],
        ],
      });
    });
  }

  test("Decodes an R app and permits an empty file list", () => {
    const url = linkForJson("[]").replace("/py/editor/", "/r/app/");
    assert.deepStrictEqual(shinyliveUrlDecode(url), {
      language: "r",
      mode: "app",
      files: [],
    });
  });

  const malformedUrls = [
    "not a URL",
    "https://shinylive.io/py/app/",
    "https://shinylive.io/py/app/#code=invalid",
    "https://shinylive.io/py/app/#code=!",
    linkForJson("not JSON"),
  ];
  malformedUrls.forEach((url, index) => {
    test(`Rejects malformed URL or compression (${index + 1}) without throwing`, () => {
      assert.strictEqual(shinyliveUrlDecode(url), undefined);
    });
  });

  const malformedFiles = [
    null,
    {},
    "files",
    [null],
    [1],
    [{ content: "text" }],
    [{ name: 42, content: "text" }],
    [{ name: "app.py" }],
    [{ name: "", content: "text" }],
    [{ name: "bad\u0000.py", content: "text" }],
    [{ name: "app.py", content: 42 }],
    [{ name: "app.py", content: "text", type: "unknown" }],
    [...appFiles, { name: "bad.txt", content: null }],
  ];
  malformedFiles.forEach((files, index) => {
    test(`Rejects invalid file-list shape (${index + 1}) without throwing`, () => {
      assert.strictEqual(
        shinyliveUrlDecode(linkForJson(JSON.stringify(files))),
        undefined
      );
    });
  });

  test("Malformed import reports a parse error without opening a save dialog", async () => {
    const errors: string[] = [];
    stub(vscode.window, "showErrorMessage", async (message: string) => {
      errors.push(message);
    });
    stub(vscode.window, "showSaveDialog", () =>
      assert.fail("Must not prompt for invalid files")
    );

    await shinyliveSaveAppFromUrl(linkForJson(JSON.stringify([{ name: 42 }])));

    assert.strictEqual(errors.length, 1);
    assert.match(errors[0], /Failed to parse/);
  });

  for (const header of ["", "h=0&"]) {
    test(`Open in Positron preserves the full payload ${header ? "with h=0" : "without h=0"}`, async () => {
      const files = [{ name: "app.py", content: 'print("hello + % &")\n' }];
      const url = linkForJson(JSON.stringify(files), header);
      assert.ok(
        new URL(url).hash.includes("+"),
        "Exercise plus signs in compressed code"
      );
      const uri = vscode.Uri.parse(
        `positron://posit.shiny/shinylive?url=${encodeURIComponent(url)}`
      );
      let warning = "";
      const errors: string[] = [];
      stub(vscode.window, "showWarningMessage", async (message: string) => {
        warning = message;
        return undefined;
      });
      stub(vscode.window, "showErrorMessage", async (message: string) => {
        errors.push(message);
      });

      await handlePositShinyUri(uri);

      assert.deepStrictEqual(errors, []);
      assert.match(warning, /app\.py/);
    });
  }

  for (const header of ["", "h=0&"]) {
    test(`Original double-encoded Open in Positron links work ${header ? "with h=0" : "without h=0"}`, async () => {
      const files = [{ name: "app.py", content: 'print("hello + % &")\n' }];
      const url = linkForJson(JSON.stringify(files), header);
      // Use the exact link construction documented in PR #70.
      const externalUrl = new URL("positron://Posit.shiny/shinylive/");
      externalUrl.searchParams.set("url", encodeURIComponent(url));
      const uri = vscode.Uri.parse(externalUrl.toString());
      let warning = "";
      const errors: string[] = [];
      stub(vscode.window, "showWarningMessage", async (message: string) => {
        warning = message;
        return undefined;
      });
      stub(vscode.window, "showErrorMessage", async (message: string) => {
        errors.push(message);
      });

      await handlePositShinyUri(uri);

      assert.deepStrictEqual(errors, []);
      assert.match(warning, /app\.py/);
    });
  }

  test("Open in Positron does not decode literal percent signs twice", async () => {
    const url = linkForJson(JSON.stringify(appFiles)).replace(
      "/editor/#",
      "/editor/?label=100%&operator=a+b#"
    );
    const uri = vscode.Uri.parse(
      `positron://posit.shiny/shinylive?url=${encodeURIComponent(url)}`
    );
    let warning = "";
    const errors: string[] = [];
    stub(vscode.window, "showWarningMessage", async (message: string) => {
      warning = message;
      return undefined;
    });
    stub(vscode.window, "showErrorMessage", async (message: string) => {
      errors.push(message);
    });

    await handlePositShinyUri(uri);

    assert.deepStrictEqual(errors, []);
    assert.match(warning, /app\.py/);
  });

  for (const query of [
    "",
    "url=",
    "url=not a URL",
    "url=https://shinylive.io/py/app/#code=!",
    "url=https%3A%2F%2Fshinylive.io%2F%zz",
  ]) {
    test(`Invalid Open in Positron query reports an error: ${query || "missing query"}`, async () => {
      const errors: string[] = [];
      stub(vscode.window, "showErrorMessage", async (message: string) => {
        errors.push(message);
      });
      stub(vscode.window, "showWarningMessage", () =>
        assert.fail("Must not review an invalid link")
      );

      await handlePositShinyUri(
        vscode.Uri.from({
          scheme: "positron",
          authority: "posit.shiny",
          path: "/shinylive",
          query,
        })
      );

      assert.strictEqual(errors.length, 1);
      assert.match(
        errors[0],
        query === "" || query === "url=" ? /No URL provided/ : /Failed to parse/
      );
    });
  }

  test("Export preserves bytes in unknown and misclassified data formats", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "shinylive-export-")
    );
    try {
      const binary = Buffer.from([0x58, 0x0a, 0, 0, 0, 3, 0xff, 0x80]);
      // The start/middle/end samples are printable ASCII, but byte 40 is not UTF-8.
      const hiddenInvalidUtf8 = Buffer.alloc(256, 0x41);
      hiddenInvalidUtf8[40] = 0xff;
      const fixtures = [
        {
          name: "app.py",
          bytes: Buffer.from(appFiles[0].content),
          expectedType: undefined,
        },
        ...["rds", "parquet", "sqlite", "xlsx", "unknown"].map((ext) => ({
          name: `data.${ext}`,
          bytes: binary,
          expectedType: "binary",
        })),
        {
          name: "sampled.png",
          bytes: hiddenInvalidUtf8,
          expectedType: "binary",
        },
        {
          name: "sampled.unknown",
          bytes: hiddenInvalidUtf8,
          expectedType: "binary",
        },
        {
          name: "known-binary.png",
          bytes: Buffer.from("Printable ASCII"),
          expectedType: "binary",
        },
        {
          name: "empty.unknown",
          bytes: Buffer.alloc(0),
          expectedType: undefined,
        },
        {
          name: "notes.unknown",
          bytes: Buffer.from("Unicode text: café 日本語\n"),
          expectedType: undefined,
        },
      ];
      await Promise.all(
        fixtures.map((file) =>
          fs.writeFile(path.join(directory, file.name), file.bytes)
        )
      );
      stub(vscode.workspace, "getConfiguration", () => ({
        get: (key: string) =>
          ({
            host: "https://shinylive.io",
            appMode: "editor",
            openAction: "copy",
          })[key],
      }));
      let exported = "";
      stub(vscode.env, "clipboard", {
        writeText: async (text: string) => {
          exported = text;
        },
      });
      stub(vscode.window, "showInformationMessage", async () => undefined);
      const uris = fixtures.map((file) =>
        vscode.Uri.file(path.join(directory, file.name))
      );

      await shinyliveCreateFromExplorer(uris[0], uris);

      const bundle = shinyliveUrlDecode(exported);
      assert.ok(bundle);
      assert.strictEqual(bundle.files.length, fixtures.length);
      for (const fixture of fixtures) {
        const file: (typeof bundle.files)[number] | undefined =
          bundle.files.find((candidate) => candidate.name === fixture.name);
        assert.ok(file, fixture.name);
        assert.strictEqual(file.type, fixture.expectedType, fixture.name);
        assert.deepStrictEqual(
          Buffer.from(file.content, file.type === "binary" ? "base64" : "utf8"),
          fixture.bytes,
          fixture.name
        );
      }
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
