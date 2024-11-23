/* eslint-disable @typescript-eslint/naming-convention */
// From https://github.com/rstudio/shinyuieditor/blob/392659a0d936e4e38ac99660e89b0327db45b3a9/inst/vscode-extension/src/extension-api-utils/runShellCommand.ts

import { spawn } from "child_process";

type ProcOutput = {
  stdout: string[];
  stderr: string[];
};
type CommandOutput = (
  | {
      status: "success";
    }
  | {
      status: "error";
      errorMsgs: string;
    }
) &
  ProcOutput;

type CommandExecOptions = {
  cmd: string;
  args?: string[];
  timeout_ms?: number;
  verbose?: boolean;
};
export async function runShellCommand({
  cmd,
  args,
  verbose = false,
  timeout_ms = 1500,
}: CommandExecOptions): Promise<CommandOutput> {
  const logger = makeLogger(verbose, "runShellCommand: ");

  return new Promise<CommandOutput>((resolve) => {
    const output: ProcOutput = { stdout: [], stderr: [] };

    const spawnedProcess = spawn(cmd, args);
    function onSpawn() {
      logger("Spawned");
    }
    function onError(e: Error) {
      logger("Error " + e.message);
      cleanup();
      resolve({ status: "error", errorMsgs: e.message, ...output });
    }
    function onClose() {
      logger("Close");
      cleanup();
      resolve({ status: "success", ...output });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function onStdout(d: any) {
      logger(`stdout: ${d.toString()}`);
      output.stdout.push(d.toString());
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function onStderr(d: any) {
      logger(`stderr: ${d.toString()}`);
      output.stderr.push(d.toString());
    }

    function cleanup() {
      clearTimeout(startTimeout);
      spawnedProcess.off("spawn", onSpawn);
      spawnedProcess.off("error", onError);
      spawnedProcess.off("close", onClose);
      spawnedProcess.stdout.off("data", onStdout);
      spawnedProcess.stderr.off("data", onStderr);
    }

    const startTimeout = setTimeout(() => {
      resolve({
        status: "error",
        errorMsgs: `Command, no response from run command within ${timeout_ms}ms:\n${cmd} ${args?.join(
          " "
        )}`,
        ...output,
      });
      cleanup();
    }, timeout_ms);

    spawnedProcess.on("spawn", onSpawn);
    spawnedProcess.on("error", onError);
    spawnedProcess.on("close", onClose);
    spawnedProcess.stdout.on("data", onStdout);
    spawnedProcess.stderr.on("data", onStderr);
  });
}

function makeLogger(verbose: boolean, prefix: string) {
  return (msg: string) => {
    if (verbose) {
      console.log(prefix + msg);
    }
  };
}
