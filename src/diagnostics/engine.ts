import type { Node } from "web-tree-sitter";
import { isShinyTree } from "../shiny-detection";
import { callName, field, parseCode, type ShinyLanguage, walk } from "./parser";
import {
  type RawDiagnostic,
  ShinyDiagnosticCode,
  ShinyDiagnosticSeverity,
} from "./rules";

export { isShinyCode } from "../shiny-detection";

type Binding = "calc" | "value" | "other";
type Symbols = Map<number, Map<string, Binding>>;

function enclosingFunction(node: Node): Node | null {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === "function_definition" || parent.type === "lambda") {
      return parent;
    }
  }
  return null;
}

function scope(node: Node, root: Node): Node {
  return enclosingFunction(node) ?? root;
}

function bind(
  symbols: Symbols,
  owner: Node,
  name: string,
  kind: Binding
): void {
  let bindings = symbols.get(owner.id);
  if (!bindings) {
    bindings = new Map();
    symbols.set(owner.id, bindings);
  }
  bindings.set(name, kind);
}

function lookup(
  symbols: Symbols,
  node: Node,
  root: Node
): { kind: Binding; owner: Node } | undefined {
  let owner: Node | null = scope(node, root);
  while (owner) {
    const binding = symbols.get(owner.id)?.get(node.text);
    if (binding) {
      return { kind: binding, owner };
    }
    owner = owner.id === root.id ? null : scope(owner, root);
  }
  return undefined;
}

function decorators(node: Node): string[] {
  if (node.parent?.type !== "decorated_definition") {
    return [];
  }
  return node.parent.namedChildren
    .filter((child) => child.type === "decorator")
    .map((child) => {
      const expression = child.firstNamedChild;
      return callName(
        expression?.type === "call"
          ? field(expression, "function")
          : (expression ?? null)
      );
    });
}

function argumentsOf(call: Node, language: ShinyLanguage): Node[] {
  const args = field(call, "arguments")?.namedChildren ?? [];
  return language === "python"
    ? args.filter((node) => node.type !== "comment")
    : args
        .filter((node) => node.type === "argument")
        .map((node) => field(node, "value"))
        .filter((node): node is Node => node !== null);
}

function stringValue(
  node: Node | undefined,
  language: ShinyLanguage
): string | undefined {
  if (node?.type !== "string" || node.hasError) {
    return undefined;
  }
  // Dynamic strings/interpolations cannot determine a static output ID.
  if (node.namedChildren.some((child) => child.type === "interpolation")) {
    return undefined;
  }
  const opening =
    language === "r"
      ? field(node, "open")
      : node.namedChildren.find((child) => child.type === "string_start");
  if (language === "python" && /b/i.test(opening?.text ?? "")) {
    return undefined;
  }
  const contents = node.namedChildren.filter(
    (child) => child.type === "string_content"
  );
  if (/r/i.test(opening?.text ?? "")) {
    return contents.map((child) => child.text).join("");
  }
  const escapes = new Map([
    ["\\", "\\"],
    ["'", "'"],
    ['"', '"'],
    ["a", "\x07"],
    ["b", "\b"],
    ["f", "\f"],
    ["n", "\n"],
    ["r", "\r"],
    ["t", "\t"],
    ["v", "\v"],
    ["\n", ""],
    ["\r\n", ""],
  ]);
  let value = "";
  for (const content of contents) {
    let offset = 0;
    for (const escape of content.namedChildren) {
      if (escape.type !== "escape_sequence") return undefined;
      value += content.text.slice(
        offset,
        escape.startIndex - content.startIndex
      );
      const text = escape.text.slice(1);
      const numeric = text.match(
        /^(?:[xuU]([\da-fA-F]+)|[uU]\{([\da-fA-F]+)\}|([0-7]{1,3}))$/
      );
      if (numeric) {
        const codePoint = numeric[3]
          ? parseInt(numeric[3], 8)
          : parseInt(numeric[1] ?? numeric[2], 16);
        if (codePoint > 0x10ffff) return undefined;
        value += String.fromCodePoint(codePoint);
      } else if (escapes.has(text)) {
        value += escapes.get(text);
      } else {
        // Leave unsupported escapes unresolved rather than inventing an ID.
        return undefined;
      }
      offset = escape.endIndex - content.startIndex;
    }
    value += content.text.slice(offset);
  }
  return value;
}

function rAssignment(node: Node): boolean {
  return (
    node.type === "binary_operator" &&
    ["<-", "=", "<<-"].includes(field(node, "operator")?.text ?? "")
  );
}

function isRead(node: Node, language: ShinyLanguage): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (parent.type === "call" && field(parent, "function")?.id === node.id) {
    return false;
  }
  if (language === "python") {
    if (
      parent.type === "attribute" &&
      field(parent, "attribute")?.id === node.id
    ) {
      return false;
    }
    if (
      ["assignment", "augmented_assignment", "named_expression"].includes(
        parent.type
      ) &&
      field(parent, "left")?.id === node.id
    ) {
      return false;
    }
    if (
      ["function_definition", "class_definition"].includes(parent.type) &&
      field(parent, "name")?.id === node.id
    ) {
      return false;
    }
    if (
      [
        "parameters",
        "default_parameter",
        "typed_parameter",
        "import_statement",
        "dotted_name",
      ].includes(parent.type)
    ) {
      return false;
    }
    if (
      parent.type === "keyword_argument" &&
      field(parent, "name")?.id === node.id
    ) {
      return false;
    }
  } else {
    if (
      ["extract_operator", "namespace_operator"].includes(parent.type) &&
      field(parent, "rhs")?.id === node.id
    ) {
      return false;
    }
    if (rAssignment(parent) && field(parent, "lhs")?.id === node.id) {
      return false;
    }
    if (
      parent.type === "parameter" ||
      (parent.type === "argument" && field(parent, "name")?.id === node.id)
    ) {
      return false;
    }
  }
  // Passing reactive callables to event decorators is intentional.
  for (
    let ancestor: Node | null = parent;
    ancestor;
    ancestor = ancestor.parent
  ) {
    if (ancestor.type === "decorator") return false;
    if (ancestor.type === "function_definition") break;
  }
  return true;
}

function suppressions(root: Node): Map<number, Set<string> | null> {
  const lines = new Map<number, Set<string> | null>();
  // Comments are skipped by the rule walker but are the only valid directives.
  function visit(node: Node): void {
    if (node.type === "comment") {
      const match = node.text.match(
        /^#\s*shiny:\s*(ignore-next-line|ignore)(?:\s+([\w., \t]+))?\s*$/
      );
      if (match) {
        const line =
          node.startPosition.row + (match[1] === "ignore-next-line" ? 1 : 0);
        const rules = (match[2] ?? "").split(/[,\s]+/).filter(Boolean);
        if (!lines.has(line)) {
          lines.set(line, rules.length ? new Set(rules) : null);
        } else if (!rules.length || lines.get(line) === null) {
          lines.set(line, null);
        } else rules.forEach((rule) => lines.get(line)?.add(rule));
      }
      return;
    }
    for (const child of node.namedChildren) visit(child);
  }
  visit(root);
  return lines;
}

export function validateShinyCode(
  text: string,
  language: ShinyLanguage
): RawDiagnostic[] {
  const tree = parseCode(text, language);
  try {
    const root = tree.rootNode;
    if (!isShinyTree(root, language)) return [];
    const diagnostics: RawDiagnostic[] = [];
    const ignored = suppressions(root);
    const emit = (
      node: Node,
      code: ShinyDiagnosticCode,
      message: string,
      severity = ShinyDiagnosticSeverity.error
    ): void => {
      const row = node.startPosition.row;
      if (
        ignored.has(row) &&
        (ignored.get(row) === null || ignored.get(row)?.has(code))
      ) {
        return;
      }
      diagnostics.push({
        code,
        message,
        severity,
        range: {
          startLine: row,
          startChar: node.startPosition.column,
          endLine: node.endPosition.row,
          endChar: node.endPosition.column,
        },
      });
    };
    const nodes = [...walk(root)];
    const symbols: Symbols = new Map();
    const outputs = new Set<string>();
    const renderers: Node[] = [];
    let coreUI = false;

    // Collect definitions first: reads can precede a definition in source order.
    for (const node of nodes) {
      if (node.type === "function_definition") {
        const name = field(node, "name");
        if (name) {
          bind(
            symbols,
            scope(node, root),
            name.text,
            decorators(node).some((d) =>
              ["reactive.calc", "reactive.Calc"].includes(d)
            )
              ? "calc"
              : "other"
          );
        }
        if (decorators(node).some((d) => d.startsWith("render.")) && name) {
          renderers.push(name);
        }
        const parameters = field(node, "parameters");
        if (parameters) {
          for (const parameter of parameters.namedChildren) {
            const name =
              parameter.type === "identifier"
                ? parameter
                : field(parameter, "name");
            if (name) bind(symbols, node, name.text, "other");
          }
        }
      }
      if (language === "python" && node.type === "assignment") {
        const left = field(node, "left");
        const right = field(node, "right");
        if (left?.type === "identifier") {
          const name =
            right?.type === "call" ? callName(field(right, "function")) : "";
          bind(
            symbols,
            scope(node, root),
            left.text,
            ["reactive.value", "reactive.Value"].includes(name)
              ? "value"
              : "other"
          );
          if (left.text === "app_ui") coreUI = true;
        }
      }
      if (language === "r" && rAssignment(node)) {
        const left = field(node, "lhs");
        const right = field(node, "rhs");
        if (left?.type === "identifier") {
          const name =
            right?.type === "call" ? callName(field(right, "function")) : "";
          bind(
            symbols,
            scope(node, root),
            left.text,
            ["reactive", "eventReactive"].includes(name) ? "calc" : "other"
          );
        }
        if (
          left?.type === "extract_operator" &&
          field(left, "lhs")?.text === "output" &&
          right?.type === "call" &&
          callName(field(right, "function")).startsWith("render")
        ) {
          const name = field(left, "rhs");
          if (name) renderers.push(name);
        }
      }
      if (node.type === "call") {
        const name = callName(field(node, "function"));
        if (
          (language === "python" && name.startsWith("ui.output_")) ||
          (language === "r" && name.endsWith("Output"))
        ) {
          let argument = argumentsOf(node, language)[0];
          if (
            language === "r" &&
            argument?.type === "call" &&
            callName(field(argument, "function")) === "ns"
          ) {
            argument = argumentsOf(argument, language)[0];
          }
          const id = stringValue(argument, language);
          if (id !== undefined) outputs.add(id);
        }
      }
    }

    for (const node of nodes) {
      if (
        node.type === "identifier" &&
        isRead(node, language) &&
        lookup(symbols, node, root)?.kind === "calc"
      ) {
        emit(
          node,
          ShinyDiagnosticCode.uncalledReactive,
          `Reactive ${language === "python" ? "calculation" : "expression"} '${node.text}' referenced without calling '()'. Call '${node.text}()' to read its current value.`
        );
      }
      if (language === "python") {
        const fn = enclosingFunction(node);
        const ds = fn ? decorators(fn) : [];
        if (
          node.type === "attribute" &&
          field(node, "object")?.text === "input" &&
          isRead(node, language) &&
          ds.some((d) => /^(?:reactive|render)\./.test(d))
        ) {
          emit(
            node,
            ShinyDiagnosticCode.uncalledInput,
            `Input '${node.text}' accessed without parentheses '()'. Inputs are reactive callables in Python.`
          );
        }
        if (node.type === "call") {
          const functionNode = field(node, "function");
          const name = callName(functionNode);
          const receiver =
            functionNode?.type === "attribute"
              ? field(functionNode, "object")
              : null;
          if (
            ds.some((d) => ["reactive.calc", "reactive.Calc"].includes(d)) &&
            functionNode &&
            field(functionNode, "attribute")?.text === "set" &&
            receiver &&
            lookup(symbols, receiver, root)?.kind === "value"
          ) {
            emit(
              functionNode,
              ShinyDiagnosticCode.calcSideEffect,
              "Side-effects detected inside @reactive.calc. Use @reactive.effect to mutate reactive values."
            );
          }
          if (
            functionNode &&
            field(functionNode, "attribute")?.text === "set" &&
            receiver &&
            lookup(symbols, receiver, root)?.kind === "value" &&
            lookup(symbols, receiver, root)?.owner.id === root.id
          ) {
            for (let owner = fn; owner; owner = enclosingFunction(owner)) {
              if (
                field(owner, "name")?.text === "server" ||
                decorators(owner).includes("module.server") ||
                field(owner, "parameters")?.namedChildren.some(
                  (parameter) => parameter.text === "session"
                )
              ) {
                emit(
                  functionNode,
                  ShinyDiagnosticCode.globalStateLeak,
                  "This session writes a module-level reactive value shared by all sessions. Move per-session state inside the server function; suppress this warning if sharing is intentional.",
                  ShinyDiagnosticSeverity.warning
                );
                break;
              }
            }
          }
          if (
            name === "time.sleep" &&
            fn?.children.some((child) => child.type === "async") &&
            functionNode
          ) {
            emit(
              functionNode,
              ShinyDiagnosticCode.blockingAsync,
              "Synchronous time.sleep() blocks the asyncio event loop. Use 'await asyncio.sleep()' or 'asyncio.to_thread()'."
            );
          }
        }
      } else if (rAssignment(node)) {
        const left = field(node, "lhs");
        const operator = field(node, "operator");
        let insideReactive = false;
        for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
          if (ancestor.type === "function_definition") break;
          if (
            ancestor.type === "call" &&
            ["reactive", "eventReactive"].includes(
              callName(field(ancestor, "function"))
            )
          ) {
            insideReactive = true;
            break;
          }
        }
        if (
          insideReactive &&
          operator &&
          (operator.text === "<<-" ||
            (left?.type === "extract_operator" &&
              ["rv", "values"].includes(field(left, "lhs")?.text ?? "")))
        ) {
          emit(
            operator,
            ShinyDiagnosticCode.calcSideEffect,
            "Side-effects detected inside reactive expression. Use observe() or observeEvent() for side-effects."
          );
        }
      }
    }
    if (outputs.size > 0 && (language === "r" || coreUI)) {
      for (const renderer of renderers) {
        if (!outputs.has(renderer.text)) {
          emit(
            renderer,
            ShinyDiagnosticCode.idMismatch,
            `Output renderer '${renderer.text}' has no statically matched UI output in this file. Its UI may be dynamic or defined in another file or module.`,
            ShinyDiagnosticSeverity.warning
          );
        }
      }
    }
    return diagnostics;
  } finally {
    tree.delete();
  }
}
