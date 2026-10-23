import * as path from "path";
import { Language, Parser, type Node, type Tree } from "web-tree-sitter";

export type ShinyLanguage = "python" | "r";
let initialization: Promise<void> | undefined;
const parsers = new Map<ShinyLanguage, Parser>();

// WASM grammars are copied by esbuild and ship with the extension. No system
// Python/R interpreter or platform-specific native addon is required.
export function initializeParsers(
  directory = path.join(__dirname, "parsers")
): Promise<void> {
  initialization ??= (async () => {
    await Parser.init();
    for (const language of ["python", "r"] as const) {
      const grammar = await Language.load(
        path.join(directory, `tree-sitter-${language}.wasm`)
      );
      const parser = new Parser();
      parser.setLanguage(grammar);
      parsers.set(language, parser);
    }
  })();
  return initialization;
}

export function parseCode(text: string, language: ShinyLanguage): Tree {
  const parser = parsers.get(language);
  if (!parser) {
    throw new Error("Shiny diagnostic parsers have not been initialized");
  }
  const tree = parser.parse(text);
  if (!tree) {
    throw new Error("Shiny diagnostic parser did not return a tree");
  }
  return tree;
}

export function* walk(node: Node): Generator<Node> {
  // Literal text is never code. Python interpolations still contain expressions.
  if (node.type === "comment" || node.type === "string_content") {
    return;
  }
  yield node;
  for (const child of node.namedChildren) {
    yield* walk(child);
  }
}

export function field(node: Node, name: string): Node | null {
  return node.childForFieldName(name);
}

export function callName(node: Node | null): string {
  if (!node) {
    return "";
  }
  if (node.type === "identifier" || node.type === "dotted_name") {
    return node.text;
  }
  if (node.type === "attribute") {
    return `${callName(field(node, "object"))}.${field(node, "attribute")?.text}`;
  }
  if (node.type === "namespace_operator") {
    return field(node, "rhs")?.text ?? "";
  }
  return "";
}
