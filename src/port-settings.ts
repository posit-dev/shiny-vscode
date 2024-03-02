import * as vscode from "vscode";
import { suggestPort } from "./net-utils";

const transientPorts: Record<string, number | undefined> = {};

export async function getAppPort(reason: "run" | "debug"): Promise<number> {
  return (
    // Port can be zero, which means random assignment
    vscode.workspace.getConfiguration("shiny.python").get("port") ||
    (await defaultPort(`app_${reason}`))
  );
}

export async function getAutoreloadPort(
  reason: "run" | "debug"
): Promise<number> {
  return (
    // Port can be zero, which means random assignment
    vscode.workspace.getConfiguration("shiny.python").get("autoreloadPort") ||
    (await defaultPort(`autoreload_${reason}`))
  );
}

async function defaultPort(portCacheKey: string): Promise<number> {
  // Retrieve most recently used port
  let port: number = transientPorts[portCacheKey] ?? 0;
  if (port !== 0) {
    return port;
  }

  port = await suggestPort();

  // Save for next time
  transientPorts[portCacheKey] = port;

  return port;
}
