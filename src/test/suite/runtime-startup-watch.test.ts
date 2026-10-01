import * as assert from "assert";
import type * as positron from "positron";
import * as vscode from "vscode";
import { watchConsoleSessionForStartupFailure } from "../../extension-api-utils/runtime-startup-watch";

// Short idle threshold so the debounce tests stay fast.
const IDLE_MS = 40;

type StateEmitter = vscode.EventEmitter<positron.RuntimeState>;

interface FakePositron {
  pst: typeof positron;
  emitter: StateEmitter;
  foregroundEmitter: vscode.EventEmitter<string | undefined>;
  setSession: (session: unknown) => void;
}

/**
 * Builds a minimal fake of the Positron API with one console session whose
 * runtime state can be driven by the test via `emitter`.
 */
function makeFakePositron(languageId = "r"): FakePositron {
  const emitter: StateEmitter = new vscode.EventEmitter();
  const foregroundEmitter = new vscode.EventEmitter<string | undefined>();

  let session: unknown = {
    runtimeMetadata: { languageId },
    onDidChangeRuntimeState: emitter.event,
  };

  const pst = {
    /* eslint-disable @typescript-eslint/naming-convention */
    RuntimeState: {
      Idle: "idle",
      Busy: "busy",
      Exited: "exited",
      Offline: "offline",
    },
    /* eslint-enable @typescript-eslint/naming-convention */
    runtime: {
      getForegroundSession: async () => session,
      onDidChangeForegroundSession: foregroundEmitter.event,
    },
  } as unknown as typeof positron;

  return {
    pst,
    emitter,
    foregroundEmitter,
    setSession: (s) => {
      session = s;
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolves "failed" if the watch fires within `ms`, or "quiet" otherwise.
 */
async function outcome(
  watch: { failure: Promise<void> },
  ms: number
): Promise<"failed" | "quiet"> {
  return Promise.race([
    watch.failure.then(() => "failed" as const),
    sleep(ms).then(() => "quiet" as const),
  ]);
}

suite("watchConsoleSessionForStartupFailure", () => {
  test("fails when the session goes busy and then idle", async () => {
    const { pst, emitter } = makeFakePositron();
    const watch = watchConsoleSessionForStartupFailure(pst, "r", IDLE_MS);
    try {
      // Let the async getForegroundSession() attach first.
      await sleep(0);
      emitter.fire("busy" as positron.RuntimeState);
      emitter.fire("idle" as positron.RuntimeState);
      assert.strictEqual(await outcome(watch, IDLE_MS * 10), "failed");
    } finally {
      watch.dispose();
    }
  });

  test("ignores idle that was never preceded by busy", async () => {
    const { pst, emitter } = makeFakePositron();
    const watch = watchConsoleSessionForStartupFailure(pst, "r", IDLE_MS);
    try {
      await sleep(0);
      emitter.fire("idle" as positron.RuntimeState);
      assert.strictEqual(await outcome(watch, IDLE_MS * 10), "quiet");
    } finally {
      watch.dispose();
    }
  });

  test("does not fail during the idle grace period if the session goes busy again", async () => {
    const { pst, emitter } = makeFakePositron();
    const watch = watchConsoleSessionForStartupFailure(pst, "r", IDLE_MS);
    try {
      await sleep(0);
      // Simulate the app code arriving as two executions: busy, a brief idle
      // gap, then busy again. The gap is shorter than the threshold, so no
      // failure may be declared...
      emitter.fire("busy" as positron.RuntimeState);
      emitter.fire("idle" as positron.RuntimeState);
      await sleep(IDLE_MS / 2);
      emitter.fire("busy" as positron.RuntimeState);
      assert.strictEqual(await outcome(watch, IDLE_MS * 3), "quiet");

      // ...but when the final execution ends, failure is declared.
      emitter.fire("idle" as positron.RuntimeState);
      assert.strictEqual(await outcome(watch, IDLE_MS * 10), "failed");
    } finally {
      watch.dispose();
    }
  });

  test("fails immediately if the session exits or goes offline", async () => {
    for (const state of ["exited", "offline"] as const) {
      const { pst, emitter } = makeFakePositron();
      const watch = watchConsoleSessionForStartupFailure(pst, "r", IDLE_MS);
      try {
        await sleep(0);
        emitter.fire(state as positron.RuntimeState);
        assert.strictEqual(await outcome(watch, IDLE_MS * 10), "failed");
      } finally {
        watch.dispose();
      }
    }
  });

  test("ignores sessions for other languages", async () => {
    const { pst, emitter } = makeFakePositron("python");
    const watch = watchConsoleSessionForStartupFailure(pst, "r", IDLE_MS);
    try {
      await sleep(0);
      emitter.fire("busy" as positron.RuntimeState);
      emitter.fire("idle" as positron.RuntimeState);
      assert.strictEqual(await outcome(watch, IDLE_MS * 10), "quiet");
    } finally {
      watch.dispose();
    }
  });

  test("attaches to a session that only appears later", async () => {
    const { pst, emitter, foregroundEmitter, setSession } =
      makeFakePositron();
    setSession(undefined);
    const watch = watchConsoleSessionForStartupFailure(pst, "r", IDLE_MS);
    try {
      await sleep(0);
      emitter.fire("busy" as positron.RuntimeState);
      emitter.fire("idle" as positron.RuntimeState);
      // Not attached yet: nothing happens.
      assert.strictEqual(await outcome(watch, IDLE_MS * 3), "quiet");

      // positron-run-app starts the console session and it becomes foreground.
      setSession({
        runtimeMetadata: { languageId: "r" },
        onDidChangeRuntimeState: emitter.event,
      });
      foregroundEmitter.fire("some-session-id");
      await sleep(0);

      emitter.fire("busy" as positron.RuntimeState);
      emitter.fire("idle" as positron.RuntimeState);
      assert.strictEqual(await outcome(watch, IDLE_MS * 10), "failed");
    } finally {
      watch.dispose();
    }
  });

  test("never fails after dispose", async () => {
    const { pst, emitter } = makeFakePositron();
    const watch = watchConsoleSessionForStartupFailure(pst, "r", IDLE_MS);
    await sleep(0);
    emitter.fire("busy" as positron.RuntimeState);
    watch.dispose();
    emitter.fire("idle" as positron.RuntimeState);
    assert.strictEqual(await outcome(watch, IDLE_MS * 10), "quiet");
  });
});
