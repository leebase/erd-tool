# Review: Governed Playbook Routing Repair (gpt-5.4 → gpt-5.5)

**Artifact reviewed:** `.agent-orch/strict-lint-repair.playbook.yaml`
**Reviewer role:** slice_reviewer (claude_code / sonnet)
**Run:** 49ec20d698be / step_03_review_verified_repair
**Date:** 2026-07-09
**Verdict:** pass

---

## Checks Run

| Command | Exit Code | Outcome |
|---|---|---|
| `python3 -m compileall src tests` | 0 | All 7 Python source files compiled without syntax errors |
| `python3 -m pytest tests/` | 0 | 14 tests collected and passed |
| `python3 -c "import yaml; yaml.safe_load(open('.agent-orch/strict-lint-repair.playbook.yaml'))"` | 0 | Playbook parses as valid YAML with no structural errors |

SHA-256 smoke pins in `step_02` were verified against the live files:
- `scripts/smoke.py` → `e81748b3db7213af18fcc83dd2e13f376cd4ea1d86ba99c569a2592256c2bc1e` ✓
- `tests/smoke_manifest.json` → `2bf0f78f4961e93c0d15f4b6005f7efa1d7f3ae4d259c8d1aca3f789be506173` ✓

---

## Lens Notes

### Correctness

**gpt-5.4 removal confirmed.** A full-project grep (`grep -r "gpt-5.4"` excluding `.git` and the scratch directory) returns no matches. The previously unavailable model is absent from all governed playbook files, template files, and supporting configuration.

**gpt-5.5 is a validated pairing.** `.agent-orch/validated-pairings.json` lists `{"harness": "codex_cli", "model": "gpt-5.5", "validated_at": "2026-07-08T01:58:58+00:00"}`. The repaired routing in `defaults.routing.primary.model` and `roles.implementation_worker[0].model` both reference the validated model.

**Routing fields are structurally sound.** `routing.primary` contains only `harness` and `model` — no extraneous fields. Writable work in `step_01` routes through `role: implementation_worker`. The read-only reviewer in `step_03` routes through `role: slice_reviewer` (claude_code / sonnet).

No correctness findings at High or Critical severity.

### Smoke Gate Integrity

The `step_02_run_user_smoke_gate` step is present and unchanged:
- `worker: smoke_runner` is set correctly.
- `file_hash_matches` validators are present for both `scripts/smoke.py` and `tests/smoke_manifest.json`.
- The declared sha256 pins match the current live file hashes (verified above).
- The existing `artifacts/user-smoke/result.json` records `app_started: true`, `core_flow_completed: true`, `start_exit_code: 0`, `check_exit_code: 0`, with no blocking errors — confirming the gate was passed in this run's `step_02`.

The routing repair did not weaken or remove the smoke gate.

### Review Gate Integrity

The `step_03_review_verified_repair` step retains all review-verdict validators:
- `json_schema` targeting `builtin:review_verdict/v1` is present.
- `review_verdict_clean` with `severity_threshold: High` is present.
- `checks_run_match` system validator is present (re-executes claimed checks and fails on mismatch).
- `on_fail.repair.step_id: step_01_repair_strict_lint_playbook` with `max_cycles: 2` preserves the escalation path to the repair step.

The routing repair did not weaken or remove the review gate.

### Workflow Behavior

`run_policy.on_step_failure: halt` and `require_validation_pass_to_advance: true` are both present. The three-step ordering (repair → smoke → review) is intact. All three steps carry `on_fail.after_retries_exhausted: halt` ensuring no silent pass-through on exhausted retries.

One previously noted Low observation carries forward: the `step_01` system validation command hard-codes an absolute path (`PYTHONPATH=/home/lee/projects/agent-orch/src`) that will break if agent-orch is relocated. This predates the routing repair and was recorded as F001 in the prior strict-lint-repair review; it is not introduced by this repair.

### Completeness

The routing repair scope was narrow and correct: only the model identifiers in `defaults.routing.primary` and `roles.implementation_worker` were updated. No other playbook structure was modified. Templates under `playbooks/templates/` use `__PLACEHOLDER__` slots for model fields and are unaffected. The `starter_proof.yaml` and `playbooks/templates/` collection contain no model references and are unchanged.

---

## Summary

The routing repair successfully removed `gpt-5.4` and replaced it with the validated `gpt-5.5` pairing. All three pipeline gates (repair, smoke, review) are intact and structurally sound. Deterministic checks pass cleanly. No High or Critical findings were identified.
