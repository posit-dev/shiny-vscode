import { execFile } from "child_process";
import * as path from "path";

export interface PythonValidationRequest {
  path: string;
  sources: Record<string, string>;
}

export interface PythonIssue {
  file: string;
  line: number;
  code: string;
  message: string;
  severity: "error" | "warning";
  sourceLine: string;
}

export interface PythonReport {
  available: true;
  entry: string;
  files: string[];
  diagnostics: PythonIssue[];
}

export function validateWithPython(
  interpreter: string,
  script: string,
  request: PythonValidationRequest,
  signal?: AbortSignal
): Promise<PythonReport | undefined> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      interpreter,
      [script],
      {
        cwd: path.dirname(request.path),
        timeout: 10000,
        maxBuffer: 4 * 1024 * 1024,
        signal,
        env: {
          ...process.env,
          ...Object.fromEntries([
            ["PYTHONIOENCODING", "utf-8"],
            ["PYTHONUTF8", "1"],
          ]),
        },
      },
      (error, stdout, stderr) => {
        if (signal?.aborted) {
          reject(signal.reason);
          return;
        }
        try {
          if (error && !stdout.trim()) throw error;
          const report: unknown = JSON.parse(stdout);
          if (!report || typeof report !== "object") {
            throw new Error("Invalid validation report");
          }
          if ("error" in report) throw new Error(String(report.error));
          if (error) throw error;
          if ("available" in report && report.available === false) {
            resolve(undefined);
            return;
          }
          if (
            !("available" in report) ||
            report.available !== true ||
            !("entry" in report) ||
            typeof report.entry !== "string" ||
            !path.isAbsolute(report.entry) ||
            !("files" in report) ||
            !Array.isArray(report.files) ||
            !report.files.every(
              (file) => typeof file === "string" && path.isAbsolute(file)
            ) ||
            !("diagnostics" in report) ||
            !Array.isArray(report.diagnostics) ||
            !report.diagnostics.every((issue: unknown) => {
              if (!issue || typeof issue !== "object") return false;
              return (
                "file" in issue &&
                typeof issue.file === "string" &&
                path.isAbsolute(issue.file) &&
                "line" in issue &&
                Number.isInteger(issue.line) &&
                Number(issue.line) > 0 &&
                "code" in issue &&
                typeof issue.code === "string" &&
                "message" in issue &&
                typeof issue.message === "string" &&
                "sourceLine" in issue &&
                typeof issue.sourceLine === "string" &&
                "severity" in issue &&
                ["error", "warning"].includes(String(issue.severity))
              );
            })
          ) {
            throw new Error("Invalid validation report");
          }
          resolve(report as PythonReport);
        } catch (failure) {
          reject(
            new Error(
              `Python Shiny validation failed: ${failure instanceof Error ? failure.message : String(failure)}${stderr ? `\n${stderr.trim()}` : ""}`
            )
          );
        }
      }
    );
    // An unavailable interpreter can close stdin before accepting the request.
    child.stdin?.on("error", () => {});
    child.stdin?.end(JSON.stringify(request));
  });
}
