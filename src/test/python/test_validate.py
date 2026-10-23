"""Run with an explicit interpreter that provides shiny.validate."""

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

BRIDGE = Path(__file__).resolve().parents[3] / "python" / "validate.py"


class PythonValidationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name).resolve()
        self.app = self.root / "app.py"
        self.app.write_text(
            "from shiny import reactive\nfrom worker import server\n"
            "@reactive.calc\ndef data():\n    return 1\n"
            "callbacks = {'data': data}\nraise RuntimeError('must not execute')\n"
        )
        self.worker = self.root / "worker.py"
        self.worker.write_text(
            "from shiny import reactive\n"
            "def server(input, output, session):\n"
            "    @reactive.extended_task\n"
            "    async def work():\n"
            "        return input.n()\n"
        )

    def validate(self, sources=None, isolated=False):
        process = subprocess.run(
            [sys.executable, *(["-S"] if isolated else []), str(BRIDGE)],
            input=json.dumps({"path": str(self.app), "sources": sources or {}}),
            text=True,
            capture_output=True,
            cwd=self.root,
        )
        self.assertEqual(process.returncode, 0, process.stderr or process.stdout)
        return json.loads(process.stdout)

    def test_saved_imports_match_cli_and_do_not_execute_app(self):
        process = subprocess.run(
            [sys.executable, "-m", "shiny", "validate", str(self.app), "--json"],
            capture_output=True,
            text=True,
            cwd=self.root,
        )
        cli = json.loads(process.stdout)
        expected = sorted(
            (issue["file"], issue["line"], issue["code"], severity, issue["message"])
            for severity in ("error", "warning")
            for issue in cli[severity + "s"]
        )
        self.assertEqual(len(expected), 1)
        report = self.validate()
        self.assertTrue(report["available"])
        self.assertEqual(
            sorted(
                (
                    issue["file"],
                    issue["line"],
                    issue["code"],
                    issue["severity"],
                    issue["message"],
                )
                for issue in report["diagnostics"]
            ),
            expected,
        )
        self.assertEqual(set(report["files"]), {str(self.app), str(self.worker)})

    def test_unsaved_entry_and_imported_sources_override_disk(self):
        self.worker.write_text("from shiny import reactive\n")
        extra = self.root / "extra.py"
        extra.write_text("from shiny import render\n")
        worker_source = (
            "from shiny import render\n@render.text\ndef result():\n"
            "    return input.n\n"
        )
        sources = {
            str(self.app): "from shiny import ui\nimport extra\n",
            str(extra): worker_source,
        }
        report = self.validate(sources)
        self.assertEqual(
            [
                (issue["file"], issue["line"], issue["code"])
                for issue in report["diagnostics"]
            ],
            [(str(extra), 4, "UNCALLED_INPUT")],
        )
        self.assertNotIn(str(self.worker), report["files"])
        self.assertEqual(extra.read_text(), "from shiny import render\n")

    def test_suppressions_and_syntax_errors_use_editor_text(self):
        source = (
            "from shiny import render\n@render.text\ndef result():\n"
            "    first = input.n  # shiny: ignore UNCALLED_INPUT\n"
            "    return input.n\n"
        )
        report = self.validate({str(self.app): source})
        self.assertEqual([issue["line"] for issue in report["diagnostics"]], [5])
        report = self.validate({str(self.app): "from shiny import ui\nif (\n"})
        self.assertEqual(report["diagnostics"][0]["code"], "SYNTAX_ERROR")

    def test_installed_library_rules_are_included(self):
        library = self.root / "sample_rules.py"
        library.write_text(
            "from shiny.validate import ValidationRule\n"
            "class NoPrint(ValidationRule):\n"
            "    def visit_Call(self, node):\n"
            "        if getattr(node.func, 'id', '') == 'print':\n"
            "            self.result.add_warning(node.lineno, 'Use logging', 'SAMPLE_PRINT')\n"
            "        self.generic_visit(node)\n"
        )
        metadata = self.root / "sample_rules-1.0.dist-info"
        metadata.mkdir()
        (metadata / "METADATA").write_text("Name: sample-rules\nVersion: 1.0\n")
        (metadata / "entry_points.txt").write_text(
            "[shiny.validators]\nsample = sample_rules:NoPrint\n"
        )
        report = self.validate({str(self.app): "from shiny import ui\nprint('test')\n"})
        self.assertEqual(
            [issue["code"] for issue in report["diagnostics"]], ["SAMPLE_PRINT"]
        )

    def test_old_shiny_is_reported_as_unavailable(self):
        package = self.root / "shiny"
        package.mkdir()
        (package / "__init__.py").write_text("")
        report = self.validate(isolated=True)
        self.assertFalse(report["available"])

    def test_imports_do_not_escape_the_app_root(self):
        self.worker.write_text("from ..outside import value\n")
        outside = self.root.parent / "outside.py"
        report = self.validate(
            {str(outside): "from shiny import render\nprint(input.n)\n"}
        )
        self.assertNotIn(str(outside), report["files"])
        self.assertEqual(report["diagnostics"], [])


if __name__ == "__main__":
    unittest.main()
