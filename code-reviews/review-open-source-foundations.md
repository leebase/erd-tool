# Review: Open-Source Foundation Evaluation

**Artifact reviewed:** `architecture.md` — Open Source Foundation Evaluation section (recorded 2026-07-08)
**Reviewer role:** slice_reviewer (claude_code / sonnet)
**Date:** 2026-07-08
**Verdict:** pass

---

## Checks Run

| Command | Exit Code | Outcome |
|---|---|---|
| `python3 -m compileall src tests` | 0 | All .py files under `src/erd_tool/` and `tests/` compiled without syntax errors |

The command was run from the repository root. No additional environment variables were required.

Smoke evidence is inspected in prose below. The smoke artifact at `artifacts/user-smoke/result.json` records `app_started: true`, `core_flow_completed: true`, `start_exit_code: 0`, and `check_exit_code: 0`, with completion in approximately one second (2026-07-08T14:51:19Z → 14:51:20Z). The manifest SHA-256 (`2bf0f78f…`) and check-script SHA-256 (`e81748b3…`) match the values pinned in the strict-lint-repair playbook review. The smoke surface confirms that `PhysicalModel` serialisation and the CLI `--smoke` path are intact, which is the relevant foundation for any future integration work described in the evaluation.

---

## Lens Notes

### Correctness

The evaluation is internally consistent. Each candidate's decision in the summary table matches its detailed rationale section, and no candidate is described as both deferred and adopted. The sole "adopt" decision (ELK / elkjs, pending human approval) is correctly scoped — it targets only the first browser layout spike, preserves the canonical physical model as the source of truth, and carries the same human-approval gate as every other candidate.

License identifications are accurate based on current upstream records: AGPL-3.0 for drawDB, EPL-2.0 for Graphviz and ELK / elkjs, MIT for Mermaid, and Unknown for snowflake-dbml-generator. The EPL-2.0 attribution for Graphviz is correct; the project relicensed from the CPL-1.0 to EPL-2.0 starting with release 2.47.0.

One correctness-adjacent nuance in the drawDB risk entry is recorded as **F002**: the AGPL v3 network-use provision (which triggers a source obligation even without binary distribution) is not distinguished from the traditional distribution-based copyleft trigger. The current defer decision handles this conservatively, but the distinction matters if any future deployment scenario involves serving drawDB components over a network.

No findings at High or Critical severity.

### Completeness

All five candidates are evaluated with the full required set of fields: upstream repository identity, license, decision, rationale, local modification expectations, synchronization strategy, contribution opportunities, risks, and human approval requirement.

One gap is recorded as **F001**: no candidate section records a specific version number or commit hash at evaluation time. The synchronization strategy section correctly calls for recording "latest release/commit … before any implementation slice relies on" a candidate, but the evaluation itself lacks a baseline snapshot. If a candidate releases a major update or relicenses between this evaluation and an adoption decision, there is no reference point in the evaluation record to compare against. This is a Low finding — the document is explicit that it is "not a dependency adoption" and any integration decision requires a later scoped review — but the absence of version anchors reduces the durability of the record.

### Security

The Mermaid risk entry notes "security review is required for rendering user-provided text." This scope is understated, recorded as **F003**: Mermaid versions have carried XSS vulnerabilities that affected rendering output regardless of whether the source text was user-provided or canonically generated. Any Mermaid rendering surface in a browser context requires a security review and a patched pinned version. The current defer decision is appropriate; the risk statement should be broadened before any integration slice begins.

### Architecture Alignment

All five decisions are aligned with the canonical physical model principle and the AGENTS.md constraints. Each integration path is described as an adapter around the model (ELK coordinates stored in diagram state, Graphviz via a DOT exporter, Mermaid via generated text) rather than as a replacement for it. No candidate introduces a cloud dependency, preserving the offline-first constraint. The drawDB and snowflake-dbml-generator decisions correctly decline adoption where licensing or provenance is unclear, consistent with the "Evaluate open-source foundations before replacing mature components" constraint.

No architecture-alignment findings.

### License Fidelity

All identified licenses appear accurate. The decision rationale correctly notes that AGPL-3.0 is a distribution and source obligation concern for drawDB, that EPL-2.0 applies to both Graphviz and ELK / elkjs, and that snowflake-dbml-generator carries unknown license risk. The human-approval requirements in the summary table are consistent with the license risk levels: AGPL and unknown-license candidates require explicit approval before any source copy or fork, EPL-2.0 candidates require approval before runtime adoption, and MIT Mermaid requires approval at the dependency-addition stage.

No license-fidelity findings.

---

## Summary

The open-source foundation evaluation in `architecture.md` is structurally sound, internally consistent, and correctly aligned with the project's canonical-model-first architecture and offline-first constraint. Three Low-severity observations were noted: a missing version snapshot in the evaluation record (F001), an understated distinction between AGPL distribution and network-use triggers in the drawDB risk section (F002), and an understated scope for Mermaid rendering security risk (F003). None rise to High or Critical severity, and none invalidate any of the five adoption decisions. The smoke surface is green.
