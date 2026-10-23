import type { Node } from "web-tree-sitter";
import {
  callName,
  field,
  parseCode,
  type ShinyLanguage,
  walk,
} from "./diagnostics/parser";
export {
  isShinyAppFilename,
  isShinyAppRPart,
  type ShinyAppLanguage,
} from "./app-filename";

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
