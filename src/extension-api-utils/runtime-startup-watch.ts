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
  let idleTimer: NodeJS.Timeout | undefined;
  let sawBusy = false;
  let settled = false;

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
    if (settled) {
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
      !session ||
      session === attachedSession ||
      session.runtimeMetadata.languageId !== languageId
    ) {
      return;
    }
    attachedSession = session;
    disposables.push(session.onDidChangeRuntimeState(onState));
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
      clearIdleTimer();
      disposables.forEach((d) => d.dispose());
    },
  };
}
