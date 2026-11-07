"""Privacy audit (spec §9, P12): static checks over the server source.

- All logging goes through `log_event` (its allow-list rejects body fields at runtime): no print(),
  no direct logger/logging calls outside app/logs.py.
- Every `log_event(...)` call site uses only allow-listed keyword fields, including branches no
  runtime test reaches. The one spread allowed is a `…timings` dict of stage timings.
"""

import ast
from pathlib import Path

from app.logs import _allowed

APP = Path(__file__).resolve().parents[1] / "app"
SOURCES = [p for p in APP.rglob("*.py") if "__pycache__" not in p.parts]


def _calls(tree: ast.AST):
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            yield node


def _name(func: ast.expr) -> str:
    if isinstance(func, ast.Name):
        return func.id
    if isinstance(func, ast.Attribute):
        base = _name(func.value)
        return f"{base}.{func.attr}" if base else func.attr
    return ""


def test_sources_found():
    assert len(SOURCES) > 10


def test_no_print_or_direct_logging_outside_logs_module():
    offenders = []
    for path in SOURCES:
        if path.name == "logs.py":
            continue
        for call in _calls(ast.parse(path.read_text())):
            n = _name(call.func)
            if n == "print" or n.startswith("logger.") or n.split(".")[0] == "logging" and n.split(".")[-1] in {"info", "warning", "error", "debug", "exception", "critical", "log"}:
                offenders.append(f"{path.relative_to(APP)}:{call.lineno} {n}")
    assert offenders == []


def test_every_log_event_call_uses_allowed_fields_only():
    seen = 0
    bad = []
    for path in SOURCES:
        for call in _calls(ast.parse(path.read_text())):
            if _name(call.func) != "log_event":
                continue
            seen += 1
            for kw in call.keywords:
                if kw.arg is None:
                    # Only stage-timing dicts may be spread (keys end in _ms; log_event re-checks).
                    if not _name(kw.value).endswith("timings"):
                        bad.append(f"{path.relative_to(APP)}:{call.lineno} **{_name(kw.value)}")
                elif kw.arg != "level" and not _allowed(kw.arg):
                    bad.append(f"{path.relative_to(APP)}:{call.lineno} {kw.arg}")
    assert seen >= 5
    assert bad == []
