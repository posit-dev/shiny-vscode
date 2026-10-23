"""Editor transport for the selected environment's public shiny.validate API.

Rules come from Shiny. Only local import discovery lives here, so unsaved
buffers can be validated without writing them to the user's project.
"""

import ast
from contextlib import redirect_stdout
import importlib
import json
from pathlib import Path
import sys


def local_imports(tree, current, root, sources):
    # Match shiny validate's local-file boundary, including package __init__.py.
    paths = []
    for node in ast.walk(tree):
        names = []
        base = root
        if isinstance(node, ast.Import):
            names = [alias.name.split(".") for alias in node.names]
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                base = current.parent
                for _ in range(node.level - 1):
                    base = base.parent
            parts = node.module.split(".") if node.module else []
            names = [parts, *[parts + [a.name] for a in node.names if a.name != "*"]]
        for parts in names:
            first = 0 if isinstance(node, ast.ImportFrom) and node.level else 1
            for length in range(first, len(parts) + 1):
                candidate = base.joinpath(*parts[:length])
                package = candidate / "__init__.py"
                file = candidate.with_suffix(".py")
                path = (
                    package
                    if package.is_file() or package.resolve() in sources
                    else file
                )
                resolved = path.resolve()
                if (path.is_file() or resolved in sources) and resolved.is_relative_to(
                    root
                ):
                    paths.append(resolved)
    return paths


def validate(request):
    entry = Path(request["path"]).resolve()
    root = entry.parent
    sources = {Path(path).resolve(): text for path, text in request["sources"].items()}
    sys.path.insert(0, str(root))
    try:
        api = importlib.import_module("shiny.validate")
    except ModuleNotFoundError as error:
        if error.name not in ("shiny", "shiny.validate"):
            raise
        return {"available": False}
    validate_code = getattr(api, "validate_shiny_code", None)
    if not callable(validate_code):
        return {"available": False}

    pending = [entry]
    seen = set()
    diagnostics = []
    while pending:
        current = pending.pop()
        if current in seen:
            continue
        seen.add(current)
        try:
            code = (
                sources[current]
                if current in sources
                else current.read_text(encoding="utf-8")
            )
        except (OSError, UnicodeError) as error:
            diagnostics.append(
                {
                    "file": str(current),
                    "line": 1,
                    "code": "FILE_READ_ERROR",
                    "message": f"Could not read file: {error}",
                    "severity": "error",
                    "sourceLine": "",
                }
            )
            continue
        report = validate_code(code)
        lines = code.splitlines()
        for severity, issues in (
            ("error", report.errors),
            ("warning", report.warnings),
        ):
            for issue in issues:
                line = issue["line"]
                diagnostics.append(
                    {
                        **issue,
                        "file": str(current),
                        "severity": severity,
                        "sourceLine": lines[line - 1] if 0 < line <= len(lines) else "",
                    }
                )
        if not any(issue["code"] == "SYNTAX_ERROR" for issue in report.errors):
            pending.extend(
                reversed(local_imports(ast.parse(code), current, root, sources))
            )
    return {
        "available": True,
        "entry": str(entry),
        "files": sorted(str(p) for p in seen),
        "diagnostics": diagnostics,
    }


def main():
    try:
        request = json.load(sys.stdin)
        # Libraries may print while loading their rules. Keep stdout as JSON.
        with redirect_stdout(sys.stderr):
            report = validate(request)
    except Exception as error:
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}))
        return 1
    print(json.dumps(report))
    return 0


if __name__ == "__main__":
    sys.exit(main())
