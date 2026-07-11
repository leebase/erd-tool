# Overview

Generated playbooks that use `markdown_headings_present` validation must carry
the exact required heading strings into worker-facing mission text. The required
strings are part of the executable contract: workers need to see the same
heading text that the validator will check, with no paraphrase, synonym,
renumbering, or formatting drift.

# Problem

This slice prevents the recurring exact-string mismatch failure where a
generated playbook describes the intended document structure in advisory prose
but gives workers heading names that differ from the `markdown_headings_present`
requirements. In that failure mode, the worker can produce a document that
matches the mission narrative yet fails the deterministic validator because one
or more required heading strings are missing exactly as written.

# Constraints

Authoring must include a deterministic lint or check that runs before launch and
compares the worker-facing mission text against each `markdown_headings_present`
required heading string. The slice must not rely on advisory prose alone,
reviewer memory, or best-effort wording to keep the validator contract aligned
with the generated mission.

# Acceptance Checks

- Tests cover a generated playbook containing `markdown_headings_present`
  validation and fail when any required heading string is absent from the
  worker-facing mission text exactly as written.
- Implementation behavior carries every required heading string from
  `markdown_headings_present` validation into the worker-facing mission text
  deterministically during authoring.
- The smoke gate exercises the authoring-time check on a representative
  generated playbook before launch and records a passing result.
- Review evidence includes the deterministic check output and confirms that the
  mission text and `markdown_headings_present` validation use identical required
  heading strings.
