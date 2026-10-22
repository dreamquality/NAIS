#!/usr/bin/env python3
"""Render pytest's junit.xml as a Markdown report for the GitHub job summary.

    pytest --junitxml=reports/junit.xml
    python scripts/junit_summary.py reports/junit.xml >> "$GITHUB_STEP_SUMMARY"

No dependencies beyond the standard library, so it also works locally
(prints to stdout). xfail/xpass are taken from pytest's junit markup:
<skipped type="pytest.xfail"> and the "[XPASS(strict)]" failure message.
"""
import sys
import xml.etree.ElementTree as ET
from collections import OrderedDict

CATEGORIES = OrderedDict([
    ("test_api01", "API1 · Broken Object Level Authorization"),
    ("test_api02", "API2 · Broken Authentication"),
    ("test_api03", "API3 · Broken Object Property Level Authorization"),
    ("test_api04", "API4 · Unrestricted Resource Consumption"),
    ("test_api05", "API5 · Broken Function Level Authorization"),
    ("test_api06", "API6 · Unrestricted Access to Sensitive Business Flows"),
    ("test_api07", "API7 · Server Side Request Forgery"),
    ("test_api08", "API8 · Security Misconfiguration"),
    ("test_api09", "API9 · Improper Inventory Management"),
    ("test_api10", "API10 · Unsafe Consumption of APIs / Injection"),
])

ICON = {"passed": "✅", "failed": "❌", "error": "💥", "xfailed": "⚠️", "xpassed": "🔁", "skipped": "⏭️"}


def outcome(case):
    if case.find("error") is not None:
        return "error", case.find("error").get("message", "")
    f = case.find("failure")
    if f is not None:
        msg = f.get("message", "") or ""
        return ("xpassed" if "XPASS" in msg else "failed"), msg
    s = case.find("skipped")
    if s is not None:
        msg = s.get("message", "") or ""
        return ("xfailed" if s.get("type") == "pytest.xfail" else "skipped"), msg
    return "passed", ""


def category(case):
    stem = case.get("classname", "").split(".")[0]
    for prefix, title in CATEGORIES.items():
        if stem.startswith(prefix):
            return title
    return stem or "other"


def main(path):
    root = ET.parse(path).getroot()
    cases = list(root.iter("testcase"))
    rows = OrderedDict((title, dict.fromkeys(ICON, 0)) for title in CATEGORIES.values())
    totals = dict.fromkeys(ICON, 0)
    problems, known = [], []

    for case in cases:
        status, msg = outcome(case)
        cat = category(case)
        rows.setdefault(cat, dict.fromkeys(ICON, 0))[status] += 1
        totals[status] += 1
        name = f"{case.get('classname', '').split('.')[0]}.py::{case.get('name')}"
        if status in ("failed", "error", "xpassed"):
            problems.append((status, name, msg))
        elif status == "xfailed":
            known.append((name, msg))

    suite_time = sum(float(s.get("time", 0)) for s in root.iter("testsuite"))
    verdict = "❌ FAILED" if totals["failed"] or totals["error"] or totals["xpassed"] else "✅ PASSED"

    out = []
    out.append(f"## API security tests · OWASP API Top 10 — {verdict}")
    out.append("")
    out.append(
        f"**{len(cases)} tests** in {suite_time:.0f}s · "
        + " · ".join(f"{ICON[k]} {v} {k}" for k, v in totals.items() if v)
    )
    out.append("")
    out.append("| Category | ✅ passed | ❌ failed | ⚠️ known (xfail) | 🔁 xpass | ⏭️ skipped |")
    out.append("|---|---:|---:|---:|---:|---:|")
    for title, c in rows.items():
        out.append(
            f"| {title} | {c['passed']} | {c['failed'] + c['error'] or ''} | {c['xfailed'] or ''} | {c['xpassed'] or ''} | {c['skipped'] or ''} |"
        )
    out.append("")

    if problems:
        out.append("### ❌ Failures (regressions or unexpectedly fixed deviations)")
        out.append("")
        for status, name, msg in problems:
            first = (msg or "").strip().splitlines()[0] if msg else ""
            out.append(f"- {ICON[status]} `{name}` — {first[:300]}")
        out.append("")

    if known:
        out.append("<details><summary>⚠️ Known deviations (xfail strict) — " + str(len(known)) + "</summary>")
        out.append("")
        for name, msg in known:
            out.append(f"- `{name}` — {msg.strip()[:300]}")
        out.append("")
        out.append("</details>")
        out.append("")

    sys.stdout.write("\n".join(out) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "reports/junit.xml"))
