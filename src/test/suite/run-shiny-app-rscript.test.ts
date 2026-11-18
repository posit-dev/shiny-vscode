// Integration tests for rscripts/runShinyApp.R, the launcher the extension
// runs in a terminal for Shiny for R apps. They exercise the real script with
// a real Rscript against apps synchronized by trigger files, focusing on the
// status-file lifecycle: the extension removes the status file's directory
// when its startup wait ends, and the launcher's late writes (an error, or
// runApp returning, after that) must neither recreate the status file nor
// mask the app's own error or exit status.
//
// Skipped entirely when Rscript or the shiny package is unavailable; CI does
// not guarantee R is installed. This file deliberately avoids importing
// `vscode` so it can also run under plain mocha.

import * as assert from "assert";
import { spawn, spawnSync, type ChildProcess } from "child_process";
import * as fs from "fs";
import * as net from "net";
import * as os from "os";
import * as path from "path";

const RSCRIPT = process.platform === "win32" ? "Rscript.exe" : "Rscript";
// Compiled, this file lives at out/test/suite/, three levels below the repo
// root; under tsx it's src/test/suite/, the same depth.
const LAUNCHER = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "rscripts",
  "runShinyApp.R"
);

const MARKER = "intentional startup failure for launcher test";

function rWithShinyAvailable(): boolean {
  const probe = spawnSync(
    RSCRIPT,
    [
      "--vanilla",
      "-e",
      "quit(status = if (requireNamespace('shiny', quietly = TRUE)) 0 else 1)",
    ],
    { encoding: "utf8", timeout: 120_000 }
  );
  return probe.status === 0;
}

async function waitFor(
  description: string,
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 30_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

function portIsOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() =>
        resolve(typeof address === "object" && address ? address.port : 0)
      );
    });
  });
}

interface LaunchResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

interface Launch {
  child: ChildProcess;
  result: Promise<LaunchResult>;
}

/** An app whose startup fails once the trigger file appears. */
function writeFailingApp(appDir: string): void {
  fs.writeFileSync(
    path.join(appDir, "app.R"),
    [
      'writeLines("ready", Sys.getenv("SHINY_TEST_READY"))',
      'while (!file.exists(Sys.getenv("SHINY_TEST_TRIGGER"))) {',
      "  Sys.sleep(0.05)",
      "}",
      `stop(${JSON.stringify(MARKER)})`,
      "",
    ].join("\n")
  );
}

/** An app that serves until the trigger file appears, then stops itself. */
function writeStoppingApp(appDir: string): void {
  fs.writeFileSync(
    path.join(appDir, "app.R"),
    [
      "library(shiny)",
      'trigger <- Sys.getenv("SHINY_TEST_TRIGGER")',
      'ui <- fluidPage("launcher test")',
      "server <- function(input, output, session) {}",
      "shinyApp(",
      "  ui = ui,",
      "  server = server,",
      "  onStart = function() {",
      "    poll <- function() {",
      "      if (file.exists(trigger)) {",
      "        shiny::stopApp()",
      "      } else {",
      "        later::later(poll, 0.1)",
      "      }",
      "    }",
      "    poll()",
      "  }",
      ")",
      "",
    ].join("\n")
  );
}

interface Fixture {
  workDir: string;
  appDir: string;
  statusDir: string;
  statusFile: string;
  triggerFile: string;
  readyFile: string;
  port: number;
  launch: Launch;
}

/** Environment the apps' trigger/ready polling relies on. */
function fixtureEnv(fixture: Fixture): NodeJS.ProcessEnv {
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    SHINY_TEST_TRIGGER: fixture.triggerFile,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    SHINY_TEST_READY: fixture.readyFile,
  };
}

suite("runShinyApp.R launcher (Rscript integration)", function () {
  this.timeout(120_000);

  const fixtures: Fixture[] = [];

  suiteSetup(function () {
    if (!rWithShinyAvailable()) {
      console.log(
        "[shiny] Skipping runShinyApp.R integration tests: " +
          "Rscript or the shiny package is not available"
      );
      this.skip();
    }
    if (!fs.existsSync(LAUNCHER)) {
      throw new Error(`Launcher script not found at ${LAUNCHER}`);
    }
  });

  suiteTeardown(async () => {
    await Promise.all(
      fixtures.map(async (f) => {
        if (f.launch.child.exitCode === null) {
          f.launch.child.kill();
          await f.launch.result.catch(() => {});
        }
        fs.rmSync(f.workDir, { recursive: true, force: true });
      })
    );
  });

  async function startFixture(
    writeApp: (appDir: string) => void
  ): Promise<Fixture> {
    const workDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "shiny-vscode-launcher-test-")
    );
    const appDir = path.join(workDir, "app");
    const statusDir = path.join(workDir, "status.d");
    fs.mkdirSync(appDir);
    fs.mkdirSync(statusDir);
    const fixture: Fixture = {
      workDir,
      appDir,
      statusDir,
      statusFile: path.join(statusDir, "status"),
      triggerFile: path.join(workDir, "trigger"),
      readyFile: path.join(workDir, "ready"),
      port: await freePort(),
      launch: undefined as unknown as Launch,
    };
    writeApp(appDir);
    const child = spawn(
      RSCRIPT,
      ["--vanilla", LAUNCHER, appDir, String(fixture.port)],
      {
        env: {
          ...process.env,
          ...fixtureEnv(fixture),
          // eslint-disable-next-line @typescript-eslint/naming-convention
          SHINY_RUN_APP_STATUS_FILE: fixture.statusFile,
        },
      }
    );
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => (stdout += d));
    child.stderr?.on("data", (d) => (stderr += d));
    fixture.launch = {
      child,
      result: new Promise<LaunchResult>((resolve) => {
        child.once("close", (code) => resolve({ code, stdout, stderr }));
      }),
    };
    fixtures.push(fixture);
    return fixture;
  }

  /** Simulates the extension's cleanup once its startup wait has ended. */
  function removeStatusDir(fixture: Fixture): void {
    fs.rmSync(fixture.statusDir, { recursive: true, force: true });
  }

  test("writes an error status when startup fails while watched", async () => {
    const fixture = await startFixture(writeFailingApp);
    // Let the app fail immediately; nobody removes the status directory.
    fs.writeFileSync(fixture.triggerFile, "go");

    const result = await fixture.launch.result;
    assert.notStrictEqual(result.code, 0, "launcher should exit non-zero");
    assert.ok(
      result.stderr.includes(MARKER),
      `stderr should carry the app's error, got:\n${result.stderr}`
    );
    const status = fs.readFileSync(fixture.statusFile, "utf8").split("\n");
    assert.strictEqual(status[0], "error");
    assert.ok(
      status.slice(1).join("\n").includes(MARKER),
      `status details should carry the app's error, got:\n${status}`
    );
  });

  test("writes an exited status when runApp returns while watched", async () => {
    const fixture = await startFixture(writeStoppingApp);
    await waitFor("the app to listen", () => portIsOpen(fixture.port));
    fs.writeFileSync(fixture.triggerFile, "go");

    const result = await fixture.launch.result;
    assert.strictEqual(result.code, 0, `stderr:\n${result.stderr}`);
    assert.strictEqual(
      fs.readFileSync(fixture.statusFile, "utf8").trim(),
      "exited"
    );
  });

  test("an error after cleanup keeps the R error and leaves no artifact", async () => {
    const fixture = await startFixture(writeFailingApp);
    // The app is in its polling loop, i.e. runApp is in flight. Remove the
    // status directory as the extension does when its startup wait ends,
    // then let the app fail.
    await waitFor("the app to start polling", () =>
      fs.existsSync(fixture.readyFile)
    );
    removeStatusDir(fixture);
    fs.writeFileSync(fixture.triggerFile, "go");

    const result = await fixture.launch.result;
    assert.notStrictEqual(result.code, 0, "launcher should exit non-zero");
    assert.ok(
      result.stderr.includes(MARKER),
      `the app's own error must survive the failed status write, got:\n${result.stderr}`
    );
    assert.ok(
      !/cannot open (the connection|file)/.test(result.stderr),
      `the failed status write must not add noise, got:\n${result.stderr}`
    );
    assert.ok(
      !fs.existsSync(fixture.statusDir),
      "the late write must not recreate the status directory"
    );
    assert.ok(!fs.existsSync(fixture.statusFile));
  });

  test("runApp returning after cleanup exits cleanly and leaves no artifact", async () => {
    const fixture = await startFixture(writeStoppingApp);
    await waitFor("the app to listen", () => portIsOpen(fixture.port));
    // The app started successfully and the extension's wait ended (preview
    // opened); it removes the status directory. The app stopping later must
    // not recreate it or trip over its absence.
    removeStatusDir(fixture);
    fs.writeFileSync(fixture.triggerFile, "go");

    const result = await fixture.launch.result;
    assert.strictEqual(
      result.code,
      0,
      `runApp returning cleanly must stay a clean exit, got code ${result.code}:\n${result.stderr}`
    );
    assert.ok(
      !/cannot open (the connection|file)/.test(result.stderr),
      `the failed status write must not add noise, got:\n${result.stderr}`
    );
    assert.ok(
      !fs.existsSync(fixture.statusDir),
      "the late write must not recreate the status directory"
    );
    assert.ok(!fs.existsSync(fixture.statusFile));
  });
});
