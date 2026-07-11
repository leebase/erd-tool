# Review: Markdown Heading Validation Template Contract

**Slice:** markdown-heading-validation-template-contract
**Date:** 2026-07-09
**Reviewer:** Agent-Orch code-reviewer (step_04 instance)
**Verdict:** pass

## Summary

The repair adds a `markdown_heading_validation_guidance` block to
`playbooks/templates/repair_before_review_feature_delivery.yaml` and a
corresponding test file `tests/test_markdown_heading_guidance.py`.  The block
carries the exact heading string `"Markdown Heading Validation Guidance"` and
the numeric minimum `80` into both worker-facing mission text and retry text,
and provides a reusable `markdown_headings_present` validation block.  All
three focused tests pass; `compileall` on `src` and `tests` is clean.  The
contract's core acceptance checks are satisfied: a deterministic test fails
when the required heading string is absent from mission or retry text, and the
guidance source exposes identical strings to those the validator checks.

A plan-vs-delivery divergence (no standalone `playbook_validation.py` Python
module) and two low-severity notes are recorded.  None reach High or Critical
severity.

## Checks Run

| Command | Exit code | Summary |
|---|---|---|
| `python3 -m pytest tests/test_markdown_heading_guidance.py` | 0 | 3 tests collected and passed: heading exposure, mission/retry text propagation, reusable validation block shape. |
| `python3 -m compileall src tests` | 0 | All source files under `src/` and `tests/` compiled without syntax errors. |

Both commands were executed in the review environment and their exit codes are
authoritative for `checks_run_match` re-execution.

## Lens Notes

### Correctness

The three tests directly exercise the contract's acceptance checks.
`test_guidance_carries_heading_contract_into_worker_mission_and_retry_text`
asserts the exact heading string `"Markdown Heading Validation Guidance"` and
the string `"80"` are present in both `mission` and `retry_message` values
found by key-fragment walk.  The `_markdown_heading_validation_blocks` helper
locates nodes with `type == "markdown_headings_present"`, confirming the
template's reusable block uses identical strings to those the validator checks.
No logic errors found in the test helpers or the template data.

### Plan Alignment

The implementation plan (Architecture section) specified adding a Python module
`src/erd_tool/playbook_validation.py` with pure functions callable from a CLI
or Agent-Orch authoring path.  That module was not created; the test imports
`erd_tool.markdown_heading_guidance` but silently falls back to reading the
template file.  The contract's acceptance checks are fulfilled through the
pytest suite, but the plan's stated architecture (importable Python API) was
not delivered.  Recorded as finding F001, severity Medium.

### Contract Coverage

Acceptance check 1 (tests fail when heading absent) and check 2 (heading
carried deterministically) are satisfied by the test suite.  Acceptance check 3
(smoke gate records a passing result before launch) has no artifact evidence
under `artifacts/`; the pytest run implicitly satisfies the spirit but no
explicit smoke manifest result was recorded.  Recorded as F002, severity Low.
Acceptance check 4 (review evidence confirms matching strings) is satisfied
by this review document and the `checks_run` entries above.

### Naming Consistency

`playbooks/templates/repair_before_review_feature_delivery.yaml` has a `.yaml`
extension but is valid JSON, not YAML.  The test handles this transparently
(JSON parse first, YAML fallback), so it is not a correctness defect.  Recorded
as F003, severity Low.
