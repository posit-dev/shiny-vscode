import * as path from "path";

/** A language that Shiny apps are written in. */
export type ShinyAppLanguage = "python" | "r";

/**
 * Determines whether a file is a Shiny application entry point based on its
 * filename.
 *
 * This function checks if a given filename follows the naming conventions for
 * Shiny application entry points in either Python or R. It validates against
 * several patterns:
 *
 * - Direct match: `app.py` or `app.R`
 * - Prefixed patterns: `app-*.py`, `app_*.py`, `app-*.R`, or `app_*.R`
 * - Suffixed patterns: `*-app.py`, `*_app.py`, `*-app.R`, or `*_app.R`
 * - For R files only: additional R-specific Shiny app patterns via
 *   `isShinyAppRPart`
 *
 * @param filename - The path or filename to check
 * @param language - The programming language, either "python" or "r"
 * @returns `true` if the filename matches a Shiny app pattern, `false`
 * otherwise
 */
export function isShinyAppFilename(
  filename: string,
  language: ShinyAppLanguage
): boolean {
  filename = path.basename(filename);

  const extension = { python: "py", r: "R" }[language];

  // Only .py or .R files
  if (!new RegExp(`\\.${extension}$`, "i").test(filename)) {
    return false;
  }

  // Accepted patterns:
  // app.py|R
  const rxApp = new RegExp(`^app\\.${extension}$`, "i");
  // app-*.py|R
  // app_*.py|R
  const rxAppDash = new RegExp(`^app[-_].+\\.${extension}$`, "i");
  // *-app.py|R
  // *_app.py|R
  const rxDashApp = new RegExp(`[-_]app\\.${extension}$`, "i");

  if (rxApp.test(filename)) {
    return true;
  } else if (rxAppDash.test(filename)) {
    return true;
  } else if (rxDashApp.test(filename)) {
    return true;
  }

  if (language === "r") {
    return isShinyAppRPart(filename);
  }

  return false;
}

/** Whether a file is one part of a multi-file R Shiny app. */
export function isShinyAppRPart(filename: string): boolean {
  filename = path.basename(filename);
  return ["ui.r", "server.r", "global.r"].includes(filename.toLowerCase());
}
