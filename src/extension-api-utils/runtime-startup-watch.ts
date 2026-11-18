// =============================================================================
// Positron console startup watch
// -----------------------------------------------------------------------------
// Positron only: watches a console session's runtime state while an app is
// starting in it. App servers like Shiny's block the session while they run,
// so the session going busy and then back to idle -- before the app's URL was
// detected -- means the app code finished without a server ever starting,
// which is almost always a startup error (e.g. a bad reference in app.R).
// Watching for that transition lets us report the failure immediately instead
// of waiting for positron-run-app's URL detection timeout.
// =============================================================================

import type * as positron from "positron";
import type * as vscode from "vscode";

/**
 * How long the session must remain idle, after having been busy, before we
 * conclude the app code finished without starting a server. Guards against
 * false positives from state flicker: e.g. if the runner ever sends the app
 * code as several executions, there are brief idle gaps between them.
 */
const IDLE_FAILURE_THRESHOLD_MS = 2000;

// Positron versions whose positron-run-app reports console app startup
// failures itself (posit-dev/positron#16435), ending the run and notifying
// the user when the app exits before its URL is detected. On these versions
// watching the session ourselves would duplicate Positron's notification, so
// callers should skip watchConsoleSessionForStartupFailure.
const FIRST_SELF_REPORTING_VERSION = [2026, 10, 0] as const;
const FIRST_SELF_REPORTING_BUILD = 297;

/**
 * Whether this Positron build reports console app startup failures on its
 * own (see above). When it does, we rely on Positron's notification and skip
 * our own watch; when it doesn't, or when we can't tell, we keep ours so the
 * user still gets a prompt failure report (worst case, a Positron we failed
 * to recognize also notifies and the user sees the failure twice).
 *
 * `positron.version` is the calendar version (e.g. "2026.10.0") without a
 * build number, so the 2026.10.0 boundary needs `positron.buildNumber` too.
 * Both have been part of the Positron API since before the oldest Positron
 * this extension supports (2025.12.0).
 */
export function positronReportsConsoleStartupFailure(
  pst: Pick<typeof positron, "version" | "buildNumber">
): boolean {
  const match = /^(\d{4})\.(\d{1,2})\.(\d+)$/.exec(pst.version ?? "");
  if (!match) {
    // Unrecognized version format: keep our own watch.
    return false;
  }
  const version = [Number(match[1]), Number(match[2]), Number(match[3])];
  for (let i = 0; i < version.length; i++) {
    if (version[i] !== FIRST_SELF_REPORTING_VERSION[i]) {
      return version[i] > FIRST_SELF_REPORTING_VERSION[i];
    }
  }
  // Same release as the fix: it shipped in build 297. Without a build number
  // we can't place this build within the release, so keep our own watch.
  return (
    typeof pst.buildNumber === "number" &&
    pst.buildNumber >= FIRST_SELF_REPORTING_BUILD
  );
}

export interface StartupFailureWatch {
  /**
   * Resolves when the watched console session indicates the app failed to
   * start. Never rejects, and never resolves while the app might still be
   * starting.
   */
  failure: Promise<void>;
  /** Stops watching. Always call once the app start attempt has settled. */
  dispose: () => void;
}

/**
 * Watches the Positron console session for `languageId` for signs that code
 * running in it (e.g. `shiny::runApp(...)`) has finished without starting a
 * server.
 *
 * The watch arms on the first busy state it observes: if the session then
 * becomes idle (and stays idle for IDLE_FAILURE_THRESHOLD_MS), exits, or goes
 * offline, the app is considered failed. If the session is already busy when
 * we attach -- e.g. the user had code running and our app code is queued --
 * the first idle is ignored and the next busy arms the watch instead.
 *
 * @param pst The Positron API object.
 * @param languageId The language of the console session to watch ("r", "python").
 * @param idleFailureThresholdMs How long the session must stay idle before
 * failure is declared. Exposed for tests; production uses the default.
 */
export function watchConsoleSessionForStartupFailure(
  pst: typeof positron,
  languageId: string,
  idleFailureThresholdMs: number = IDLE_FAILURE_THRESHOLD_MS
): StartupFailureWatch {
  const disposables: vscode.Disposable[] = [];
  let sessionDisposable: vscode.Disposable | undefined;
  let idleTimer: NodeJS.Timeout | undefined;
  let sawBusy = false;
  let settled = false;
  let disposed = false;

  let resolveFailure!: () => void;
  const failure = new Promise<void>((resolve) => {
    resolveFailure = resolve;
  });

  const clearIdleTimer = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = undefined;
    }
  };

  const fail = () => {
    if (!settled) {
      settled = true;
      clearIdleTimer();
      resolveFailure();
    }
  };

  const onState = (state: positron.RuntimeState) => {
    if (settled || disposed) {
      return;
    }
    if (state === pst.RuntimeState.Busy) {
      sawBusy = true;
      clearIdleTimer();
    } else if (
      state === pst.RuntimeState.Exited ||
      state === pst.RuntimeState.Offline
    ) {
      fail();
    } else if (state === pst.RuntimeState.Idle && sawBusy) {
      clearIdleTimer();
      idleTimer = setTimeout(fail, idleFailureThresholdMs);
    }
  };

  let attachedSession: positron.LanguageRuntimeSession | undefined;
  const attach = (session: positron.LanguageRuntimeSession | undefined) => {
    if (
      disposed ||
      !session ||
      session === attachedSession ||
      session.runtimeMetadata.languageId !== languageId
    ) {
      return;
    }
    // Once the attached session has gone busy, the app code is running there.
    // A later foreground change is the user switching consoles, so keep
    // watching the app's session rather than following the new one.
    if (sawBusy) {
      return;
    }
    // A different console session took over before the app code started:
    // drop the previous session's listener and re-arm, so its busy/idle
    // events can't fail this startup.
    sessionDisposable?.dispose();
    sawBusy = false;
    clearIdleTimer();
    attachedSession = session;
    sessionDisposable = session.onDidChangeRuntimeState(onState);
  };

  // The console session usually already exists as the foreground session by
  // the time Run App executes. If it doesn't, positron-run-app starts one and
  // it becomes the foreground session; pick it up when that happens.
  void pst.runtime.getForegroundSession().then(attach, () => undefined);
  disposables.push(
    pst.runtime.onDidChangeForegroundSession(() => {
      void pst.runtime.getForegroundSession().then(attach, () => undefined);
    })
  );

  return {
    failure,
    dispose: () => {
      disposed = true;
      clearIdleTimer();
      sessionDisposable?.dispose();
      disposables.forEach((d) => d.dispose());
    },
  };
}
