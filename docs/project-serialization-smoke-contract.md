# Project Serialization Smoke Contract

Status: smallest persistence contract for the
`canonical_model_project_serialization_smoke_coverage` governed slice.

This document defines the minimum project-file persistence behavior needed
before broader Snowflake fixture work continues. The contract is deliberately
small: persist the canonical physical model, load it back, and prove that the
loaded model is the same canonical model value. It does not add diagram state,
editor state, live Snowflake connectivity, DDL generation, or full round-trip
engineering.

## Overview

Project serialization is a thin persistence envelope around the canonical
physical model. The canonical physical model remains the source of truth.
Provider-specific metadata, diagram projections, and future editor state may be
derived from or wrapped around it later, but must not replace it.

The smallest project payload is a JSON-compatible object with this shape:

```json
{
  "project_version": "1",
  "physical_model": {
    "name": "operations-domain-model"
  }
}
```

For the current seed implementation, `physical_model` is exactly the value
returned by `PhysicalModel.to_dict()`: `{"name": <model name>}`. When the
canonical physical model expands to the v1 object graph described in
`docs/canonical-physical-model-v1-contract.md`, the same envelope still applies:
`physical_model` becomes that canonical model dictionary without adding
provider, session, or UI state to it.

## Project File Contract

The project file contract has one responsibility in this slice: carry the
canonical physical model through a JSON project envelope without changing the
canonical model value. The envelope is versioned independently so later project
files can add diagram or editor sections outside `physical_model` without
changing what the canonical model means.

## What Must Serialize

Serialization must produce JSON-compatible dictionaries only: strings, numbers,
booleans, `null`, lists, and objects. The output must be accepted by
`json.dumps()` without custom encoders.

The project envelope must serialize:

- `project_version`: string, exactly `"1"` for this contract.
- `physical_model`: the canonical physical model dictionary.

For the seed model, `physical_model` must serialize:

- `name`: stable human-readable model name.

Serialization must be deterministic across Python runs for the same model
value. It must not include timestamps, filesystem paths, hostnames, random ids,
Snowflake account names, warehouses, roles, connections, sessions, canvas
state, diagram nodes or edges, viewport state, themes, selections, undo history,
or generated smoke evidence.

## What Must Deserialize

Deserialization must accept the project envelope above and reconstruct a
`PhysicalModel` through the canonical model API. It must not expose the project
file as a provider-native graph or a UI document in place of the canonical
model.

For the seed model, deserialization must require:

- A top-level object.
- `project_version == "1"`.
- `physical_model` as an object.
- `physical_model.name` as a string.

The deserialized model must serialize back to the same canonical
`physical_model` dictionary. Unsupported project versions, missing required
fields, or malformed field types must fail loudly instead of returning a
partial model.

Deserialization must not ignore unknown top-level or physical-model fields in
this smallest contract. A later compatibility contract may define optional
fields and defaults, but this smoke slice should treat unexpected shape as a
contract mismatch so persistence failures are visible.

## Round-Trip Equality

Round-trip equality is canonical JSON value equality, not byte-for-byte file
text equality.

The required persistence round trip is:

1. Start with a `PhysicalModel`.
2. Serialize it into the project envelope.
3. Encode the envelope with `json.dumps()`.
4. Decode the text with `json.loads()`.
5. Deserialize the decoded envelope into `PhysicalModel`.
6. Serialize the loaded model into a second project envelope.
7. Assert the first and second envelopes are equal as Python dictionary values.

Formatting differences such as indentation, trailing newline, and object member
text order in raw JSON are not meaningful when the decoded values are equal.
Loss of model name, version, canonical ids, table order, column ordinal order,
constraints, relationships, or any other canonical model field is meaningful
once those fields exist and must fail the round-trip check.

## Smoke Evidence

Project serialization smoke evidence should stay small, local, and reproducible.
It should be fixture-like without becoming the user smoke oracle itself.

The minimum evidence for this slice is:

- A deterministic in-test or fixture model name, such as
  `operations-domain-model`.
- The expected project envelope value.
- A JSON encode/decode check proving the envelope is plain JSON data.
- A deserialize/re-serialize check proving canonical model value equality.
- A negative check that provider, session, and UI keys do not appear in the
  `physical_model` payload.

The evidence must not require network access, Snowflake credentials, a browser,
or machine-local paths. Future Snowflake fixture evidence should continue to use
local fixture files and compare canonical JSON values, following
`docs/canonical-physical-model-v1-contract.md`.

Fixture-like evidence may live in pytest assertions, local fixture files, or
governed run artifacts. It must remain generated from deterministic local input
and must not be serialized into the project file itself.

## Pinned User Smoke Oracle

The pinned user smoke oracle remains the existing smoke configuration:

- `tests/smoke_manifest.json`
- `scripts/smoke.py`

Serialization tests may add focused pytest coverage and fixture-like assertions,
but they must not redefine user smoke success. For governed runs, user-visible
smoke should continue to execute the commands pinned by
`tests/smoke_manifest.json`: start with `python3 tests/smoke_start.py` and
check with `python3 scripts/smoke.py`.

The serialization smoke evidence is accepted only when those pinned smoke
commands still pass. If the project serializer introduces a new CLI or file
workflow later, that workflow may be added behind the existing smoke oracle, but
the oracle must remain explicit in `tests/smoke_manifest.json` and
`scripts/smoke.py`.

## Acceptance Checks

This contract is satisfied when a governed implementation slice demonstrates:

- `PhysicalModel` can be serialized into the project envelope.
- The project envelope survives `json.dumps()` and `json.loads()` unchanged as a
  value.
- The decoded envelope deserializes back into `PhysicalModel`.
- Re-serializing the loaded model produces the same envelope value.
- Malformed or unsupported envelopes fail loudly.
- Provider, session, runtime, and UI state remain outside `physical_model`.
- Existing pytest coverage passes.
- The pinned user smoke oracle in `tests/smoke_manifest.json` and
  `scripts/smoke.py` passes unchanged unless a later governed slice explicitly
  revises the smoke oracle.
