import {
  type RawDiagnostic,
  ShinyDiagnosticCode,
  ShinyDiagnosticSeverity,
} from "./rules";

export function isShinyCode(text: string): boolean {
  return (
    text.includes("shiny") ||
    text.includes("reactive") ||
    text.includes("render") ||
    text.includes("module") ||
    text.includes("@module") ||
    text.includes("NS(") ||
    text.includes("moduleServer")
  );
}

export function validateShinyCode(
  text: string,
  languageId: "python" | "r"
): RawDiagnostic[] {
  const diagnostics: RawDiagnostic[] = [];

  if (languageId === "python") {
    validatePythonShinyCode(text, diagnostics);
  } else if (languageId === "r") {
    validateRShinyCode(text, diagnostics);
  }

  return diagnostics;
}

function validatePythonShinyCode(
  text: string,
  diagnostics: RawDiagnostic[]
): void {
  const lines = text.split("\n");
  const reactiveCalcNames = new Set<string>();
  const declaredOutputIds = new Set<string>();
  const renderFunctions: Array<{ name: string; lineIndex: number }> = [];

  let insideCalc = false;
  let calcIndent = 0;
  let insideFunction = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const indent = line.search(/\S/);

    if (trimmed.startsWith("#") || trimmed.length === 0) {
      continue;
    }

    if (
      insideCalc &&
      indent <= calcIndent &&
      !trimmed.startsWith("@") &&
      !trimmed.startsWith("def ") &&
      !trimmed.startsWith("async def ")
    ) {
      insideCalc = false;
    }

    if (trimmed.startsWith("def ") || trimmed.startsWith("async def ")) {
      insideFunction = true;
    } else if (indent === 0 && !trimmed.startsWith("@")) {
      insideFunction = false;
    }

    if (trimmed.startsWith("@reactive.calc")) {
      insideCalc = true;
      calcIndent = indent;
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        const match = nextLine.match(/^(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(/);
        if (match) {
          reactiveCalcNames.add(match[1]);
        }
      }
    }

    if (trimmed.startsWith("@render.")) {
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        const match = nextLine.match(/^(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(/);
        if (match) {
          renderFunctions.push({ name: match[1], lineIndex: i + 1 });
        }
      }
    }

    const outputMatches = line.matchAll(/ui\.output_[a-zA-Z0-9_]+\(\s*["']([a-zA-Z0-9_]+)["']/g);
    for (const match of outputMatches) {
      declaredOutputIds.add(match[1]);
    }

    if (insideCalc && trimmed.includes(".set(")) {
      const charIndex = line.indexOf(".set(");
      diagnostics.push({
        code: ShinyDiagnosticCode.calcSideEffect,
        message: "Side-effects detected inside @reactive.calc. Calculations must be pure functions without mutating external reactive values.",
        severity: ShinyDiagnosticSeverity.error,
        range: {
          startLine: i,
          startChar: Math.max(0, charIndex),
          endLine: i,
          endChar: charIndex + 5,
        },
      });
    }

    if (trimmed.includes("time.sleep(") && (trimmed.startsWith("async ") || text.includes("@reactive.extended_task"))) {
      const charIndex = line.indexOf("time.sleep(");
      diagnostics.push({
        code: ShinyDiagnosticCode.blockingAsync,
        message: "Synchronous time.sleep() blocks the asyncio event loop. Use 'await asyncio.sleep()' or offload blocking I/O with 'asyncio.to_thread()'.",
        severity: ShinyDiagnosticSeverity.error,
        range: {
          startLine: i,
          startChar: Math.max(0, charIndex),
          endLine: i,
          endChar: charIndex + 11,
        },
      });
    }

    if (indent === 0 && (trimmed.includes("= reactive.value(") || trimmed.includes("= reactive.Value("))) {
      if (trimmed.includes("user") || trimmed.includes("session") || trimmed.includes("auth") || trimmed.includes("account")) {
        const charIndex = line.indexOf("reactive.value");
        diagnostics.push({
          code: ShinyDiagnosticCode.globalStateLeak,
          message: "User-specific reactive.value defined at global scope may leak state across sessions. Ensure session state is defined inside the server function.",
          severity: ShinyDiagnosticSeverity.error,
          range: {
            startLine: i,
            startChar: Math.max(0, charIndex !== -1 ? charIndex : 0),
            endLine: i,
            endChar: line.length,
          },
        });
      }
    }

    if (insideFunction) {
      for (const calcName of reactiveCalcNames) {
        const regex = new RegExp(`\\b${calcName}\\b(?!\\s*\\()`, "g");
        let m;
        while ((m = regex.exec(line)) !== null) {
          if (trimmed.startsWith("def ") || trimmed.startsWith("async def ") || trimmed.startsWith("@")) {
            continue;
          }
          diagnostics.push({
            code: ShinyDiagnosticCode.uncalledReactive,
            message: `Reactive calculation '${calcName}' referenced without calling '()'. Call '${calcName}()' to read its current value.`,
            severity: ShinyDiagnosticSeverity.error,
            range: {
              startLine: i,
              startChar: m.index,
              endLine: i,
              endChar: m.index + calcName.length,
            },
          });
        }
      }
    }
  }

  if (declaredOutputIds.size > 0 && text.includes("app_ui")) {
    for (const renderFn of renderFunctions) {
      if (!declaredOutputIds.has(renderFn.name)) {
        const line = lines[renderFn.lineIndex];
        const charIndex = line.indexOf(renderFn.name);
        diagnostics.push({
          code: ShinyDiagnosticCode.idMismatch,
          message: `Output renderer '${renderFn.name}' has no matching UI output element (e.g. ui.output_text("${renderFn.name}")).`,
          severity: ShinyDiagnosticSeverity.error,
          range: {
            startLine: renderFn.lineIndex,
            startChar: Math.max(0, charIndex),
            endLine: renderFn.lineIndex,
            endChar: charIndex + renderFn.name.length,
          },
        });
      }
    }
  }
}

function validateRShinyCode(
  text: string,
  diagnostics: RawDiagnostic[]
): void {
  const lines = text.split("\n");
  const reactiveExprNames = new Set<string>();
  const declaredOutputIds = new Set<string>();
  const renderAssignments: Array<{ name: string; lineIndex: number }> = [];

  let insideReactive = false;
  let reactiveBraceCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("#") || trimmed.length === 0) {
      continue;
    }

    const reactiveDefMatch = line.match(/\b([a-zA-Z0-9_.]+)\s*(?:<-|=)\s*(?:reactive|eventReactive)\s*\(/);
    if (reactiveDefMatch) {
      reactiveExprNames.add(reactiveDefMatch[1]);
      insideReactive = true;
      reactiveBraceCount = 0;
    }

    if (insideReactive) {
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      reactiveBraceCount += openBraces - closeBraces;

      if (trimmed.includes("<-") && (trimmed.includes("rv$") || trimmed.includes("values$") || trimmed.includes("<<-"))) {
        const charIndex = line.indexOf("<-");
        diagnostics.push({
          code: ShinyDiagnosticCode.calcSideEffect,
          message: "Side-effects detected inside reactive expression. Reactive expressions must be pure. Use observe() or observeEvent() for side-effects.",
          severity: ShinyDiagnosticSeverity.error,
          range: {
            startLine: i,
            startChar: Math.max(0, charIndex),
            endLine: i,
            endChar: charIndex + 2,
          },
        });
      }

      if (reactiveBraceCount <= 0 && line.includes("}")) {
        insideReactive = false;
      }
    }

    const renderMatch = line.match(/\boutput\$([a-zA-Z0-9_.]+)\s*(?:<-|=)\s*render[A-Za-z]+\s*\(/);
    if (renderMatch) {
      renderAssignments.push({ name: renderMatch[1], lineIndex: i });
    }

    const outputMatches = line.matchAll(/\b(?:plot|text|table|ui|verbatimText|html|image)Output\(\s*["']([a-zA-Z0-9_.]+)["']/g);
    for (const match of outputMatches) {
      declaredOutputIds.add(match[1]);
    }

    for (const rxName of reactiveExprNames) {
      if (line.includes(`${rxName} <-`) || line.includes(`${rxName}=`)) {
        continue;
      }
      const regex = new RegExp(`\\b${rxName}\\b(?!\\s*\\()`, "g");
      let m;
      while ((m = regex.exec(line)) !== null) {
        diagnostics.push({
          code: ShinyDiagnosticCode.uncalledReactive,
          message: `Reactive expression '${rxName}' referenced without calling '()'. Call '${rxName}()' to read its value.`,
          severity: ShinyDiagnosticSeverity.error,
          range: {
            startLine: i,
            startChar: m.index,
            endLine: i,
            endChar: m.index + rxName.length,
          },
        });
      }
    }
  }

  if (declaredOutputIds.size > 0) {
    for (const renderItem of renderAssignments) {
      if (!declaredOutputIds.has(renderItem.name)) {
        const line = lines[renderItem.lineIndex];
        const charIndex = line.indexOf(renderItem.name);
        diagnostics.push({
          code: ShinyDiagnosticCode.idMismatch,
          message: `Output renderer '${renderItem.name}' has no matching UI output element (e.g. plotOutput("${renderItem.name}") or textOutput("${renderItem.name}")).`,
          severity: ShinyDiagnosticSeverity.error,
          range: {
            startLine: renderItem.lineIndex,
            startChar: Math.max(0, charIndex),
            endLine: renderItem.lineIndex,
            endChar: charIndex + renderItem.name.length,
          },
        });
      }
    }
  }
}
