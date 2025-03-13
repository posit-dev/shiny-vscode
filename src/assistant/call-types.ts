import type { TerminalWithMyPty } from "../extension-api-utils/run-command-terminal-output";
import type { CommandOutput } from "../extension-api-utils/runShellCommand";

// Need a better name for this
export type RunCommandWithTerminalResult = {
  cmdResult: CommandOutput;
  terminal?: TerminalWithMyPty;
  resultString: string;
};
