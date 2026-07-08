# Agent Guide: erd-tool

This repository is operated by the `erd-tool` auto-orch mission from
`/home/lee/projects/agent-orch/missions/erd-tool`.

This project uses AgentFlow: the markdown files in this repo are shared memory
between humans, auto-orch, Agent-Orch, and worker agents. Treat updates to those
files as part of the work, not as optional notes.

## Startup Protocol

At the start of every session, in order:

1. Read `AGENTS.md`.
2. Read `context.md` for current state and next action.
3. Read `result-review.md` for recently completed work.
4. Read `sprint-plan.md` for current sprint tasks and priorities.
5. Read `WHERE_AM_I.md` for product-level orientation.
6. Read `project-plan.md`, `product-definition.md`, and `architecture.md` when
   scope or technical direction is unclear.
7. Check the sibling runs root `../erd-tool-agent-orch-runs/` and the latest
   dashboard before assuming manual implementation is appropriate.

If asked to set up, launch, resume, or report on governed work, read
`OPERATE.md` and follow its generate -> lint -> human approval ->
`launch-workflow --detach` -> relay-banner sequence. Auto-orch should author
playbooks and launch Agent-Orch through the real CLI; do not replace that path
with ad hoc scripts.

## Mission

Build a professional database modeling studio, starting with Snowflake reverse
engineering, editable ER diagrams, reusable project files, Snowflake DDL
generation, and round-trip engineering.

## Constraints

- Prefer React and TypeScript for the application.
- Use Python for metadata tooling when it is the simpler, maintainable choice.
- Keep normal use offline-first; cloud services must not be required.
- Strengthen the canonical physical model rather than bypassing it.
- Evaluate open-source foundations before replacing mature components.

## Quality Gates

Generated work should include automated tests, format/lint/type checks, smoke
checks for user-visible workflows, and Agent-Orch review verdict gates.

## AgentFlow Updates

- Update `context.md` and `result-review.md` when a governed run, sprint slice,
  or meaningful manual intervention completes.
- Update `sprint-plan.md` when sprint tasks change state.
- Keep Agent-Orch run evidence outside the workspace in
  `../erd-tool-agent-orch-runs/`.
- Preserve strong smoke and review-verdict gates on code-producing playbooks.
