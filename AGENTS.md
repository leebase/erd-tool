# Agent Guide: erd-tool

This repository is operated by the `erd-tool` auto-orch mission from
`/home/lee/projects/agent-orch/missions/erd-tool`.

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
