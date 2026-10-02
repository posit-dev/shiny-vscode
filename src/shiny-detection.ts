import * as path from "path";
import type { Node } from "web-tree-sitter";
import {
  callName,
  field,
  parseCode,
  type ShinyLanguage,
  walk,
} from "./diagnostics/parser";

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
  language: string
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

export function isShinyAppRPart(filename: string): boolean {
  filename = path.basename(filename);
  return ["ui.r", "server.r", "global.r"].includes(filename.toLowerCase());
}

export function isShinyTree(root: Node, language: ShinyLanguage): boolean {
  for (const node of walk(root)) {
    if (language === "python") {
      if (node.type === "import_from_statement") {
        const name = field(node, "module_name")?.text ?? "";
        if (name === "shiny" || name.startsWith("shiny.")) return true;
      }
      if (node.type === "import_statement") {
        for (const child of node.namedChildren) {
          const name =
            child.type === "aliased_import"
              ? field(child, "name")?.text
              : child.text;
          if (name === "shiny" || name?.startsWith("shiny.")) return true;
        }
      }
      if (node.type === "decorator") {
        const expression = node.firstNamedChild;
        const name = callName(
          expression?.type === "call"
            ? field(expression, "function")
            : (expression ?? null)
        );
        if (/^(?:reactive|render|module)\./.test(name)) return true;
      }
    } else if (node.type === "call") {
      const name = callName(field(node, "function"));
      if (["library", "require"].includes(name)) {
        const argument = field(node, "arguments")?.namedChildren[0];
        const value = argument && field(argument, "value");
        if (value?.text.replace(/^['"]|['"]$/g, "") === "shiny") return true;
      }
      if (
        [
          "shinyApp",
          "moduleServer",
          "NS",
          "reactive",
          "eventReactive",
        ].includes(name)
      ) {
        return true;
      }
    }
  }
  return false;
}

export function isShinyCode(text: string, language: ShinyLanguage): boolean {
  const tree = parseCode(text, language);
  try {
    return isShinyTree(tree.rootNode, language);
  } finally {
    tree.delete();
  }
}
