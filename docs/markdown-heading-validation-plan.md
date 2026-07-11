# Architecture

Add the deterministic validation as a small Python module in the existing flat
`src/erd_tool/` package beside `cli.py`, `model.py`, and
`project_serialization.py`; for example,
`src/erd_tool/playbook_validation.py`. That module should contain pure
functions that accept decoded playbook data, find every
`markdown_headings_present` validation requirement, extract each required
heading string, and compare those strings with the worker-facing mission text
for the same generated playbook.

Keep the check independent of Snowflake metadata, the canonical physical model,
and UI concerns. The validator is an authoring-time governance check: it
protects generated playbooks from drifting away from their executable
`markdown_headings_present` contract before launch. If the check needs to be
invoked from a CLI or Agent-Orch authoring path, that wrapper should call the
package module rather than duplicating parsing or string matching logic.

The implementation should parse playbook YAML into structured data, then use
exact string membership for each required heading. It should not infer headings
from advisory prose, normalize synonyms, renumber headings, or accept partial
matches. The failure message should name the missing heading string and the
playbook section or step whose mission text did not carry it.

# Tests

Add focused pytest coverage for the package-level validator. The tests should
construct minimal representative playbook dictionaries or YAML fixtures so the
behavior is deterministic and does not require launching Agent-Orch.

Required coverage:

- Missing heading strings: a generated playbook with
  `markdown_headings_present` validation fails when any required heading string
  is absent from the worker-facing mission text exactly as written.
- Exact heading text in mission prose: a playbook passes when mission prose
  includes the exact required heading text, and fails for paraphrases,
  case changes, added numbering, or formatting drift.
- Valid playbooks: representative valid playbooks without heading drift pass,
  including playbooks with multiple required headings and unrelated validation
  checks.

The pytest assertions should inspect clear exception messages or structured
result objects so future failures show which heading drifted.

# Verification

Run:

```bash
python3 -m pytest
python3 -m compileall src tests
```

The focused verification should run `python3 -m pytest
tests/test_markdown_heading_validation.py` before the broad suite so failures
identify the exact heading-contract behavior quickly. The broad pytest run and
compileall check then prove the new validator integrates with the existing
package without breaking model, project serialization, smoke, or documentation
workflows.

# Risks

False positives are possible if the validator searches the wrong text field or
requires headings in implementation-only notes instead of worker-facing mission
text. Keep the extraction rules explicit and test representative generated
playbook shapes.

YAML parsing assumptions can hide drift if duplicate keys, malformed validation
blocks, or unexpected playbook shapes are accepted by a generic parser but not
by Agent-Orch. The authoring check should use the same structured playbook
shape expected by the real strict loader, or run after strict loading has
produced validated playbook data.

Preserve the existing smoke and review gates. This deterministic heading check
is an additional authoring-time guard; it must not replace user smoke,
compile/test verification, review verdict artifacts, or `checks_run_match`
style review evidence already used by governed playbooks.
