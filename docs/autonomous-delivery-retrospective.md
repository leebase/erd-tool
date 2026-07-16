# Autonomous Delivery Retrospective: SQLite to Snowflake ERD Tool

**Date:** 2026-07-11
**Scope:** From the initial Agent-Orch scaffold through the completed working
ERD application delivery.

## The Original Mission

The project began as a small AgentFlow/Agent-Orch workspace rather than a
finished application. Its persistent objective was to complete unfinished
sprints and backlog work, then deliver a credible ERD application.

The final product direction was unusually specific:

- use the existing `drawdb-io/drawdb` editor through the public
  `leebase/drawdb` fork;
- use `kieler/elkjs` for automatic layout;
- make a canonical physical model—not the editor—the source of truth;
- reverse engineer Chinook SQLite;
- forward engineer its structure into Snowflake with legal names and mapped
  types;
- treat Snowflake PK/UQ/FK relationships as informational only;
- use Snowflake key-pair authentication only; and
- do not claim success without a live end-to-end quality gate.

The original operator instruction also made the collaboration model explicit:
the lead agent owns planning and architecture; a bounded Cursor worker may
implement; and an independent Terra review must challenge the assembled result.

## What Agent-Orch Accomplished First

Before the application build, autonomous Agent-Orch runs created the durable
project operating system:

| Run | Autonomous outcome |
|---|---|
| `92f0f7950898` | Strict-lint repair and smoke evidence. |
| `f5c992dbfae3` | Open-source foundation evaluation and licensing/provenance decision record. |
| `b280da16ca4a` | Executable canonical-model test scaffold. |
| `e83567a7f4bc` | Markdown-heading validation repair for governed workflows. |
| `b29a5acdb7d2` | Offline Snowflake fixture strategy and deterministic canonical-model seam. |

Those runs did not yet make the product. They did establish the habits that made
the final delivery safer: project memory in `context.md`, scoped tests, review
artifacts, explicit decision records, credential exclusion, and a useful
Agent-Orch readiness check.

## The Final Autonomous `/goal`

The final `/goal` ran as an end-to-end delivery effort while the human was
away. It began by reading the project handoff and the exact mission attachment,
then made the following product decisions without waiting for further direction:

1. Keep `erd-tool` responsible for canonical semantics, SQLite/Snowflake
   translation, project validation, CLI, and local serving.
2. Keep the public drawDB fork responsible for React editing, local browser
   persistence, canonical-project projection, and ELK-based positioning.
3. Keep diagram layout separate from the logical/physical schema model.
4. Refuse to model data copying as part of the gate; schema structure was the
   required proof.
5. Emit Snowflake relationships with `NOT ENFORCED`, never automatically add
   `RELY`, and defer foreign keys with `ALTER TABLE` so cycles and self-links
   remain valid.

The implementation was delivered in small bounded slices through the Cursor
worker, while architecture, acceptance criteria, diff inspection, tests, live
operations, and repair decisions remained with the lead agent. Independent
Terra review was not ceremonial: it repeatedly found material bugs, including
composite SQLite foreign keys, cyclic Snowflake constraints, legacy browser
projects, multi-schema projection, comments/defaults, identifier behavior,
canonical invariants, and browser/backend parity. Each was repaired and tested
before the final `PASS` verdict.

## What Was Built Autonomously

### Canonical and command-line layer

- Immutable canonical v1 model with namespaces, tables, ordered columns, types,
  constraints, relationships, defaults, comments, and strict stable IDs.
- Strict project envelope with separately stored diagram layout and explicit
  exclusion of credentials, accounts, roles, warehouses, and sessions.
- SQLite introspection with affinity mapping, name normalization, composite and
  self-referencing foreign-key support, partial-index safety checks, and
  read-only URI handling.
- Snowflake DDL parser/renderer with quote-aware defaults/comments, legal
  identifiers, type bounds, multi-schema support, deterministic object order,
  informational keys, and deferred FKs.
- CLI commands for SQLite import, Snowflake import, DDL rendering, project
  validation, browser serving, and smoke checks.

### Editor layer

- Snowflake dialect support in the drawDB fork.
- Canonical project open/save adapter, including multi-schema models, empty
  projects, and old projects without namespace metadata.
- ELK automatic layout with undo/save integration.
- DDL preview showing the same canonical Snowflake structure.
- Real browser flow covering import, edit, layout, save/reopen, and DDL preview.
- Licensing/provenance materials for drawDB and elkjs, including local patch
  history and third-party notices.

## The Live Quality Gate

The decisive proof used the official Chinook SQLite database from SQLite
Tutorial. The workflow was:

```text
chinook.db
  → read-only SQLite introspection
  → canonical .erd.json project
  → editable drawDB ER model and ELK layout
  → generated Snowflake DDL
  → key-pair Snowflake apply
  → Information Schema verification
```

The completed live target was `ERD_TOOL_CHINOOK.PUBLIC`.

| Verified property | Result |
|---|---:|
| Tables | 11 |
| Columns | 64 |
| Primary keys | 11 |
| Foreign keys | 11 |
| Enforced key constraints | 0 |

That final zero matters: Snowflake contains the relationship metadata but does
not enforce it, exactly as the project contract requires. No Chinook row data
was moved.

## How Autonomous Was It?

Most of the delivery execution was autonomous:

- project rehydration and backlog triage;
- two-repository architecture and implementation contract;
- worker delegation and every implementation repair brief;
- repeated independent review loops;
- local/unit/CLI/browser/subprocess verification;
- key-pair Snowflake structure migration and Information Schema checks;
- AGPL/EPL notices and provenance work;
- documentation, sprint closeout, commits, and pushes to both repositories.

Human direction remained essential at the right boundary. The human selected the
product goal, open-source foundations, public fork, database source, Snowflake
account authority, and the requirement that the gate be a real SQLite-to-
Snowflake demonstration. The autonomous work then executed those decisions,
raised quality standards through repeated review, and did not broaden scope into
row-data movement or a live metadata connector.

## Final Result

The result was not a mockup. It was a tested structural-engineering workflow:

- 119 Python tests;
- 46 drawDB adapter/layout tests;
- production build and lint checks;
- real cross-repository browser flow;
- manual Chrome walkthrough;
- live Snowflake verification; and
- final independent Terra review `PASS`.

The original delivery was committed and pushed as `erd-tool` commits `d88dc51`
and `364e9b1`, plus drawDB commit `7601f6a`.

## 2026-07-15 Desktop Release Update

The subsequent autonomous mission converted the browser workflow into an
installable Electron application, added live Snowflake reverse engineering,
expanded the desktop suite to 115 tests, validated an unsigned Apple Silicon
package, and consolidated the modified drawDB source into this repository.

The public release also made the licensing boundary explicit: original
canonical Python tooling is MIT licensed, while the drawDB-derived desktop
application remains AGPL-3.0-only. Linux and Windows packaging are deferred
until their own release gates can run on those operating systems.

## What Is Intentionally Next, Not Missing

The completed milestone moves structures. It does not move row data. Future
work can deliberately add live Snowflake metadata reverse engineering, row-data
copying, richer editor operations, or collaboration—but those are new product
decisions, not unfinished requirements concealed inside this delivery.
