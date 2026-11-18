import * as assert from "assert";
import { EventEmitter } from "events";
import { PassThrough } from "stream";
import { getRemoteSafeUrl } from "../../extension-api-utils/getRemoteSafeUrl";

// Stub mutable CommonJS exports, not esbuild's read-only namespace wrappers.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import childProcess = require("child_process");
// eslint-disable-next-line @typescript-eslint/no-require-imports
import fs = require("fs");

suite("Workbench preview URLs", () => {
  const restore: (() => void)[] = [];

  function stub(object: object, key: string, value: unknown): void {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    Object.defineProperty(object, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value,
    });
    restore.push(() => {
      if (descriptor) {
        Object.defineProperty(object, key, descriptor);
      } else {
        Reflect.deleteProperty(object, key);
      }
    });
  }

  // Keep the real command-output collection and URL construction. Only replace
  // the Workbench executable and its filesystem detection, unavailable in CI.
  function commandOutput(stdout: string[], stderr: string[] = []): void {
    stub(childProcess, "spawn", () => {
      const child = Object.assign(new EventEmitter(), {
        stdout: new PassThrough(),
        stderr: new PassThrough(),
      });
      process.nextTick(() => {
        child.emit("spawn");
        stdout.forEach((chunk) => child.stdout.write(chunk));
        stderr.forEach((chunk) => child.stderr.write(chunk));
        child.stdout.end();
        child.stderr.end();
        child.emit("close", 0, null);
      });
      return child;
    });
  }

  setup(() => {
    stub(process.env, "RS_SERVER_URL", "https://workbench.example/");
    stub(process.env, "RS_SESSION_URL", "/s/test-session/");
    const existsSync = fs.existsSync;
    stub(fs, "existsSync", (path: fs.PathLike) =>
      path === "/usr/lib/rstudio-server/bin/rserver-url"
        ? true
        : existsSync(path)
    );
  });

  teardown(() => {
    restore
      .splice(0)
      .reverse()
      .forEach((undo) => undo());
  });

  test("opens the reported hexadecimal proxy token", async () => {
    commandOutput(["7550ccb7\n"]);
    assert.strictEqual(
      await getRemoteSafeUrl(8000),
      "https://workbench.example/s/test-session/p/7550ccb7/"
    );
  });

  test("accepts uppercase hexadecimal tokens", async () => {
    commandOutput(["7550CCB7"]);
    assert.strictEqual(
      await getRemoteSafeUrl(8000),
      "https://workbench.example/s/test-session/p/7550CCB7/"
    );
  });

  test("continues accepting digit-only output", async () => {
    commandOutput(["30507931"]);
    assert.strictEqual(
      await getRemoteSafeUrl(8000),
      "https://workbench.example/s/test-session/p/30507931/"
    );
  });

  test("reassembles a token split across stdout chunks", async () => {
    commandOutput(["7550", "ccb7", "\n"]);
    assert.strictEqual(
      await getRemoteSafeUrl(8000),
      "https://workbench.example/s/test-session/p/7550ccb7/"
    );
  });

  for (const { name, stdout } of [
    { name: "empty output", stdout: [] },
    { name: "whitespace-only output", stdout: [" \n"] },
    { name: "diagnostic text", stdout: ["Error: forwarding failed\n"] },
    { name: "undefined text", stdout: ["undefined"] },
    { name: "multiple output lines", stdout: ["7550ccb7\n1234\n"] },
    {
      name: "a full URL instead of a token",
      stdout: ["https://workbench.example/s/test-session/p/7550ccb7/"],
    },
  ]) {
    test(`rejects ${name} and retains command diagnostics`, async () => {
      commandOutput(stdout, ["forwarding diagnostic"]);
      await assert.rejects(getRemoteSafeUrl(8000), {
        message:
          "Failed to get Posit workbench forwarded port. Output:\n" +
          stdout.join("") +
          "forwarding diagnostic",
      });
    });
  }

  test("throws when the forwarding executable cannot start", async () => {
    stub(childProcess, "spawn", () => {
      const child = Object.assign(new EventEmitter(), {
        stdout: new PassThrough(),
        stderr: new PassThrough(),
      });
      process.nextTick(() => child.emit("error", new Error("spawn ENOENT")));
      return child;
    });
    await assert.rejects(getRemoteSafeUrl(8000), {
      message:
        "Failed to get Posit workbench forwarded port. Error msg:\nspawn ENOENT",
    });
  });

  test("throws when the server URL is empty", async () => {
    commandOutput(["30507931"]);
    process.env["RS_SERVER_URL"] = "";
    await assert.rejects(getRemoteSafeUrl(8000), {
      message: "Can't find URL for workbench.",
    });
  });

  test("throws when the session URL is missing", async () => {
    commandOutput(["30507931"]);
    delete process.env["RS_SESSION_URL"];
    await assert.rejects(getRemoteSafeUrl(8000), {
      message: "Can't find URL for workbench.",
    });
  });
});
