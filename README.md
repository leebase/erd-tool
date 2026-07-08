# ERD Tool

Autonomous mission workspace for a professional database modeling studio.

The first production milestone is Snowflake-focused:

- Connect to Snowflake.
- Reverse engineer existing schemas.
- Produce attractive editable ER diagrams.
- Save reusable project files.
- Generate Snowflake DDL.
- Support successful round-trip engineering.

## Foundation Strategy

This project should evaluate mature open-source foundations before building new
components. Initial candidates include drawDB for visual modeling,
snowflake-dbml-generator for Snowflake metadata extraction, and Graphviz, ELK,
or Mermaid-style tooling for layout and rendering.

Any adopted foundation needs documented license, upstream, local modifications,
fork/adoption strategy, and upstream synchronization plan.
