# ERD Tool — Remediation Sprint Plan

> ## ⏸ PARKED 2026-09-03 — RESUME HERE
> **State:** Sprint 1 code landed on `drawdb` branch `s1-02-fk-direction` (`a943261` S1-02, `5c07ab5` S1-03a, `df35dd3` S1-04, `18582b9` S1-05, `28a0eb5` WIP harness), pushed to origin. Node tests 166/0, lint clean, Electron bundle builds, one scripted browser flow passes. **Not merged.**
> **Blocking defect, unresolved:** Lee's live test of the branch build (drawDB Desktop, built from the branch on the Mac) — Add Table blanks the renderer, reproducible after save/reopen. **Not reproduced headlessly, not bisected; unknown whether it is caused by S1-05's state plumbing or pre-exists in `d654b2d`.** Do not hand Lee another build until an interaction suite that clicks Add Table, drags a relationship, and round-trips New/Open/Save passes in both web and Electron.
> **Resume steps:** (1) `cd ~/projects/drawdb && git checkout s1-02-fk-direction && npm ci && npm run build && npm run build:electron`; (2) `node scripts/interaction-harness.mjs web ./dist` — dismiss the "Choose a database" modal by clicking Snowflake → Confirm (harness does not yet), click Add Table, read `pageerror`; (3) repeat with `git worktree add ../drawdb-base d654b2d` to bisect; (4) fix, extend `src/erdTool/browserFlow.test.js` (or a new Electron Playwright test) to cover Add Table + FK drag + New/Open/Save; (5) then continue: S1-03b copy button, S2-04a restore CLI-profile discovery, tree-identity decision (§0a), S3 visuals.
> **Open decisions for Lee:** §0a tree identity (drawdb takes `com.leebase.erdtool`?); whether to keep the Flash-worker/Fable-supervisor pair (worker output was clean on every mechanical gate; the miss was the supervisor's gate not covering editor interactions).
> **Live Snowflake:** `ERD_TOOL_CHINOOK.PUBLIC` with 11 PK/11 FK is on `MSIGASI-PI27465`; Linux profile `msigasi_leebase`, Mac profile of the same name + key at `/Users/lee/.snowflake/keys/msigasi_leebase_20260903.p8`; in the drawdb build use Connections → Manage Connections (key-pair) — CLI profiles aren't listed there (S2-04a).


**Date:** 2026-09-03
**Tested build:** ERD Tool 0.1.0 (macOS, `com.leebase.erdtool`), driven live on lees-macbook-air
**Source referenced:** `~/projects/drawdb` (Electron + drawDB fork, HEAD `fbe78fa`) and `~/projects/erd-tool` (canonical model / CLI)
**Scope tested:** Snowflake connection, reverse engineering (Snowflake → diagram), forward engineering (diagram → Snowflake DDL), and building a model from scratch. Everything else (Terraform, LLM authoring, non-Snowflake dialects) was out of scope.

This plan is written so an implementing model can work ticket-by-ticket without re-deriving context. Every ticket has: what was observed, how to reproduce it, where the code lives, what to change, and what "done" looks like. Tickets are ordered by sprint, and within a sprint by priority.

---

## 0. Executive summary

The app connects to Snowflake, lists databases/schemas/tables, imports columns with correct types and nullability, saves and reopens project files, and generates syntactically correct Snowflake DDL. That core loop works.

Four things block it from being trustworthy as a modeling tool:

1. **Forward engineering does not exist in the shipped app.** "Snowflake DDL" is a read-only preview with no copy, no save, and no deploy. There is no way to push a model into Snowflake from the UI. (The source tree has a `connections:forward-engineer` IPC and a "Connections" menu, but the shipped 0.1.0 build does not include them, and even in source "forward engineer" only writes a `.sql` file.)
2. **Relationship direction is inconsistent across canvas, side panel, and DDL.** Dragging from a PK field to an FK field draws the correct "1 → n" on the canvas but emits `ALTER TABLE <parent> ADD FOREIGN KEY ... REFERENCES <child>` — a reversed FK that Snowflake will reject. Pressing the swap button fixes the DDL but then flips the canvas markers to the wrong end.
3. **Reverse engineering drops all PK/FK constraints — confirmed.** After adding 11 PKs and 11 FKs to `ERD_TOOL_CHINOOK.PUBLIC` and verifying them in Snowsight, a fresh import in the app still shows 0 relationships and 11 "no primary key" issues. The renderer mapper works on well-formed input and the shipped build contains the constraint queries, so the fault is in how `snowflakeService.reverseEngineer` handles real driver output. Every existing test mocks the driver. A diagnostic script (`scripts/re-diagnose.mjs`) is included to pinpoint which metadata array comes back empty.
4. **Two overlapping product surfaces confuse the user.** drawDB's web-app chrome (browser-storage File menu with New/Open/Save/Export/Delete diagram, "Last saved" chip driven by IndexedDB autosave, a perpetual "Saving…" spinner) sits beside ERD Tool's native project toolbar. They disagree about whether the document is saved and which "Save" is meant.

Beyond those, there are roughly twenty smaller functional and visual defects, listed below. None are hard individually; together they are what makes the app feel unfinished.

**Verified-working (no ticket needed):** key-pair profile discovery from Snowflake CLI config; connect/disconnect; database/schema/table listing; column type mapping incl. `NUMBER(p,s)`, `VARCHAR(n)`, `TIMESTAMP_NTZ(9)`; nullability (`?` marker); native Save As / Open round trip preserving layout and zoom; ELK auto layout; Fit-to-window; dark mode; relationship creation by drag; PK/NOT NULL emission in DDL; deferred `ALTER TABLE … NOT ENFORCED` FK emission; the `Export SQL` dialog (syntax highlighting, copy, save-to-file).

---

## 0a. Finding 2026-09-03 (Chief of Staff): two Electron trees, and the tree the plan cites is not the one that ships

- `~/projects/erd-tool/desktop/` builds the installed **ERD Tool** app (`com.leebase.erdtool`, 0.1.0). Its source has not changed since the release commit `f9696b1` (2026-07-15). This is what Sections 1–5 tested.
- `~/projects/drawdb` (this plan's "source referenced") is the same code continued: `fbe78fa` (2026-07-24) added the Connections menu and forward-engineer IPC; `d654b2d` (2026-08-12) checkpointed more. It builds as **"drawDB Desktop"** (`io.drawdb.desktop`, 0.0.0) — a different bundle id, so a branch build installs beside, not over, ERD Tool.
- Divergence: `Canvas.jsx` identical; `main.ts`, `desktopBridge.js`, `ErdToolActions.jsx`, `snowflakeService.js`, `Modal.jsx` differ by ~40–200 lines each (drawdb newer).
- **Regressions drawdb introduced vs the shipped app:** the Reverse Engineer dialog lists only in-app saved connections — the "Snowflake CLI profile" mode is gone (users with `~/.snowflake/config.toml` key-pair profiles must re-enter them via Connections → Manage Connections). Conversely drawdb already fixes the `~` expansion noted under S2-04.
- **Consequence for this plan:** S4-05 (build provenance) moves to the front. Remediation work lands in `drawdb` (branch `s1-02-fk-direction`: S1-02, S1-03a, S1-04, S1-05 done). Recommended: give drawdb the ERD Tool identity/version and treat `erd-tool/desktop` as a release snapshot synced from it; restore CLI-profile discovery as a P1 ticket (S2-04a).

## 1. Test environment and how to reproduce the setup

- App launched from `/Applications/ERD Tool.app` (bundle `com.leebase.erdtool`), window maximised to 1372×888 logical px.
- Snowflake CLI profiles present in `~/.snowflake/connections.toml`: `leebase_agentic_trial` (default — JWT rejected), `erd-tool` (account trial ended, warehouses suspended), `sf-trial-migrate-target` (**works**; account alias shown as `GC33251`, role `ACCOUNTADMIN`, warehouse `COMPUTE_WH`).
- Test databases on the working account: `ERD_TOOL_CHINOOK.PUBLIC` (11 tables; **11 PKs + 11 FKs added 2026-09-03 17:33 CT** via `scripts/add-keys-erd_tool_chinook-public.sql`) and `ERD_TOOL_DEMO.CHINOOK` (11 tables, no constraints — a matching script exists but was not applied). Also `SNOWFLAKE_SAMPLE_DATA` for scale tests.
- Project files created during testing, in `~/Documents`: `claude-qa-chinook.erd.json.json` (the double extension is itself a bug — see S2-06) and `claude-qa-model.erd.json.json` (2-table CUSTOMER/ORDERS model with one FK).

---

## 2. Sprint 1 — Correctness blockers (est. 5–7 dev-days)

Goal: a modeler can round-trip a schema with keys and relationships through Snowflake without producing wrong DDL.

### S1-01 · Reverse engineering drops PK/FK constraints  **[P0 · CONFIRMED]** → **RE-SCOPED 2026-09-03: NOT A CODE DEFECT**

> **Resolution 2026-09-03 (Chief of Staff, Linux).** The diagnostic was re-run from Linux importing the unchanged source `snowflakeService.js` + `snowflakeMetadata.js` against both accounts. Against `MSIGASI-PI27465` (where the keys were added): 22 constraints, 23 key columns, 11 referential, mapper → 11 relationships / 11 PKs, composite `PLAYLIST_TRACK` PK present. Against `MNGPXMA-RQ97177`: zero constraints exist at the account itself. The Mac profile `sf-trial-migrate-target` resolves to `mngpxma-rq97177` (confirmed from `~/.snowflake/config.toml` on the Mac), so the app was connected to the old account while the keys were added in Snowsight on the new one. Source HEAD `fbe78fa` is correct.
>
> **Remaining scope (P2):** fix-shape items (c) debug per-query row-count logging (`ERD_TOOL_DEBUG_SNOWFLAKE=1`) and (d) the post-import warning "No key constraints were returned by Snowflake for this schema" — that warning would have caught this test mix-up. Items (a)/(b) are dropped; the live test in S4-01 still covers the round trip. S1-01 no longer blocks S1-03.


> **Timeline 2026-09-03.** (1) First import of `ERD_TOOL_CHINOOK.PUBLIC` → 0 PKs, 0 FKs. (2) `SHOW PRIMARY KEYS` → `No data`: the migrated schema had no constraints, so the result was inconclusive. (3) Added 11 PKs + 11 FKs via Snowsight (`scripts/add-keys-erd_tool_chinook-public.sql`); `SHOW IMPORTED KEYS` returned 11 rows and `INFORMATION_SCHEMA.TABLE_CONSTRAINTS` returns the expected rows (verified for ALBUMS/ARTISTS: `PK_ALBUMS`, `PK_ARTISTS`, `FK_ALBUMS_ARTISTID`). (4) Re-ran Reverse Engineer in the shipped app with a fresh connection → **still Relationships (0) and 11 "no primary key" issues.** The constraint path is broken in the shipped build.

**What is ruled out.**
- Test data: Snowflake now has the constraints (step 3).
- Build drift: the installed `app.asar` (Jul 16) contains the same `SHOW PRIMARY KEYS` / `SHOW IMPORTED KEYS` / `TABLE_CONSTRAINTS` queries as `src/electron/snowflakeService.js` L611–740 (verified by grep; the reverse-engineer function is byte-for-byte the same logic).
- The renderer mapper: `snowflakeMetadataToDiagram` in `src/erdTool/snowflakeMetadata.js` produces PKs and a relationship when fed correctly shaped rows (probed with a 2-table fixture in Node: `ALBUMS:ALBUMID*`, `ARTISTS:ARTISTID*`, 1 relationship). And it *throws* on malformed rows rather than silently dropping, so a silent 0 means the arrays arriving from main are empty (`rows()` at L18 returns `[]` for `undefined`).
- The IPC layer: `main.ts` L451 and `desktopBridge.js` L241 pass the object through unmodified.

**So the defect is inside `reverseEngineer` in `snowflakeService.js` (L590–740): one or more of `tableConstraints`, `keyColumnUsage`, `referentialConstraints` is coming back empty from real Snowflake.** Every existing test — including `tests/snowflake-live-connection.test.mjs` — mocks the driver, so this has never been exercised against a real account.

**Step 1 — run the diagnostic (5 min, on the Mac):**
```bash
cd ~/projects/drawdb && node scripts/re-diagnose.mjs sf-trial-migrate-target ERD_TOOL_CHINOOK PUBLIC
```
It calls the real service (`connect` → `listTables` → `reverseEngineer`) and prints the row count and a sample row for each of the six metadata arrays, then runs the mapper. Whichever array is 0 (or whose sample has unexpected keys) is the bug.

**Suspects, in order, once the diagnostic shows which array is empty:**
1. **SHOW row filter (L658–675):** `row.database_name === database && row.schema_name === schema`. If the SDK returns SHOW output keyed differently than assumed (e.g. `"database_name"` present but the value is the account-qualified name, or `key_sequence` as a string), the filter yields 0 and `keyColumnUsage` is empty → every constraint has `columns: []` → the mapper's `buildTables` treats it as no key. Print `primaryKeyRows[0]` raw before filtering.
2. **`selectedTableConstraints` (L679–683):** FK constraints are kept only if `selectedForeignKeyNames.has(constraint.constraint_name)` — names come from `SHOW IMPORTED KEYS`' `fk_name`. If (1) is empty, all FKs are dropped here too.
3. **Bind-parameter query for `TABLE_CONSTRAINTS` (L639–643):** the identical filter works for `COLUMNS`, so unlikely — but confirm the count is 22 for Chinook.
4. **Error swallowing:** none found in this function (the catch rethrows), but confirm no `try` wraps the SHOW calls in the installed build.

**Fix shape.** After the root cause is found: (a) fix the mapping; (b) add a *real* live test gated on `ERD_TOOL_LIVE_PROFILE` that asserts `tableConstraints.length === 22` and `relationships.length === 11` for `ERD_TOOL_CHINOOK.PUBLIC`; (c) add a debug toggle (env `ERD_TOOL_DEBUG_SNOWFLAKE=1`) that logs per-query row counts from `reverseEngineer`, so the next silent drop is visible in the app log; (d) surface a UI warning after import when tables > 0 but constraints = 0 ("No key constraints were returned by Snowflake for this schema") so users are told rather than shown a wrong model.

**Done when:** importing `ERD_TOOL_CHINOOK.PUBLIC` in the app shows `Relationships (11)`, zero "no primary key" issues, and the composite `PLAYLIST_TRACK` PK and self-referencing `EMPLOYEES.REPORTSTO` FK are both present.

---

### S1-02 · Normalise relationship direction so canvas, side panel, and DDL agree  **[P0]**

**Observed.** With CUSTOMER(CUSTOMER_ID PK) and ORDERS(ORDER_ID PK, CUSTOMER_ID), dragging from `CUSTOMER.CUSTOMER_ID` to `ORDERS.CUSTOMER_ID`:
- Canvas draws **1** at CUSTOMER and **n** at ORDERS (correct).
- Side panel shows `Primary: ORDERS  Foreign: CUSTOMER` (wrong).
- Snowflake DDL emits `ALTER TABLE MODEL.PUBLIC.CUSTOMER ADD CONSTRAINT FK_CUSTOMER_CUSTOMER_ID_ORDERS FOREIGN KEY (CUSTOMER_ID) REFERENCES MODEL.PUBLIC.ORDERS (CUSTOMER_ID) NOT ENFORCED;` (wrong — references a non-key column; Snowflake rejects this even for NOT ENFORCED).
- Pressing the ⇄ swap button fixes the side panel and DDL, but the canvas then shows **1** at ORDERS and **n** at CUSTOMER (wrong).

**Root cause.** Upstream drawDB's convention is start = FK holder, end = referenced table (`src/utils/exportSQL/shared.js` L66–76; `RelationshipInfo.jsx` L234–241 labels `Primary: endTable`, `Foreign: startTable`). But `getCardinality` in `src/components/EditorCanvas/Canvas.jsx` L609–626 infers `ONE_TO_MANY` from *which end holds the PK*, and the canvas draws the "1" at the start end for ONE_TO_MANY. So the visual is key-aware but the model direction is drag-aware, and the DDL follows the model.

**Fix (in `Canvas.jsx` `handleLinking`, ~L628–670):** after computing `cardinality`, if `startIsUnique && !endIsUnique` (user dragged parent → child), swap `startTableId/startFieldId` with `endTableId/endFieldId` and set cardinality to `MANY_TO_ONE`'s visual equivalent — i.e. normalise so that **start is always the FK side**. Then the existing canvas rendering, sidebar labels, and `projectAdapter.js` L1944–2013 (which puts the FK constraint on `startTableId`) all agree without further change. Also regenerate `name` after the swap (currently `fk_${startTableName}_${startField.name}_${endTableName}` is computed before the swap, which is why the swap button yields `fk_ORDERS_CUSTOMER_ID_CUSTOMER` while the original was `fk_CUSTOMER_CUSTOMER_ID_ORDERS`).

**Also:** make the cardinality marker rendering in the canvas relationship component derive "1"/"n" from the same rule as the DDL (FK side = n), not from start/end position. `EditorCanvas/Relationship.jsx` L87–100 hard-codes `cardinalityStart = "1"` for `ONE_TO_MANY`; once start is normalised to the FK side, that case should become `cardinalityStart = "n", cardinalityEnd = "1"` (or simply normalise the stored cardinality to `MANY_TO_ONE` at creation).

**Done when:** for both drag directions, the canvas "1" is on the PK table, the side panel says `Primary: <PK table>`, and the DDL FK is on the non-PK table. Add a unit test in `src/erdTool/projectAdapter.test.js` covering a relationship whose start field is the PK.

---

### S1-03 · Ship forward engineering: copy, save, and execute DDL against a connection  **[P0]**

**Observed.** The toolbar "Snowflake DDL" button opens a modal (`ErdToolActions.jsx` L651–668) with a `<pre>` and a Close button. No copy, no save, no deploy. The user's only routes to a `.sql` file are the drawDB `File → Export SQL` dialog (which *does* have copy and save) — a second, better DDL viewer with a different look. The shipped app's macOS menu bar has no "Connections" menu even though `src/electron/main.ts` L490–563 defines one with "Forward Engineer To Connection"; and that handler (`ErdToolActions.jsx` L427–461) only writes the DDL to a file via `exportDesktopConnectionDDL`, it never executes it.

**Fix, three parts:**

1. **Unify the two DDL viewers.** Make the toolbar "Snowflake DDL" button open the same dialog as `File → Export SQL` (the `Export` modal in `EditorHeader/Modal/Modal.jsx` with the CodeMirror pane, copy button, filename input, Export). Delete the bare `<pre>` modal. Keep the "(PK/FK informational)" hint as a subtitle.

2. **Add "Deploy to Snowflake…" as a first-class action.** New IPC `snowflake:execute-ddl` in `src/electron/main.ts` + `snowflakeService.js`: accepts `{ sessionId, statements[] }`, runs each statement sequentially with `executeRows`, returns `{ ok, results: [{ statement, ok, error?, rowsAffected? }] }`. Split on `;` at statement boundaries (the renderer already produces one statement per DDL chunk in `renderCanonicalSnowflakeDDL`; expose the array rather than re-splitting text). Wire a "Deploy…" button into the DDL dialog that: (a) reuses the connect UI from `SnowflakeReverseEngineer.jsx` (extract `ConnectionPicker` component), (b) asks for target database/schema override (default from the model's namespace, see S2-01), (c) shows a pre-flight list of statements with a checkbox "Use `CREATE OR REPLACE` / `IF NOT EXISTS`" (default IF NOT EXISTS; never drop), (d) streams per-statement success/failure into the dialog, (e) on failure stops and shows the exact statement and Snowflake error text.

3. **Make the shipped build match source.** The installed 0.1.0 predates the Connections menu. Add a `desktop:build-info` IPC returning git SHA + build date, show it in About, and add a CI check that the DMG in `dist-installers/` is built from the tagged commit. (Today "About" shows only "Version 0.1.0 (0.1.0)".)

**Done when:** from a fresh model, Deploy creates the database/schema/tables/constraints in `sf-trial-migrate-target`, and Reverse Engineer of that schema reproduces the model with keys and relationships (this is the round trip the README promises).

---

### S1-03b · Labelled "Copy DDL" in the export dialog footer  **[P2 · added 2026-09-03 from Lee's live test]**
S1-03a unified the viewers, but the copy control is drawDB's icon-only button absolutely positioned at the bottom-right inside the Monaco pane (`src/components/CodeEditor/index.jsx` ~L67-75); Lee could not find it. Add a labelled "Copy DDL" button in the `MODAL.CODE` footer beside Export (Modal.jsx), reusing the same clipboard logic, with the tick feedback. Keep the in-pane icon.

### S1-04 · Fix "New ERD Project" silently doing nothing  **[P1]**

**Observed.** With the Chinook import loaded and "Unsaved changes" showing, clicking **New ERD Project** did nothing: no dialog, no toast, no state change. The button rendered in its pressed state. Clicking elsewhere confirmed the app was responsive. After saving the project via Save As, New ERD Project worked. Later, the identical guard *did* show its `window.confirm` when triggered from the Reverse Engineer import path.

**Code.** `ErdToolActions.jsx` L181–186 `newProject` → `confirmNativeDocumentReplacement` (L302–314), which uses `globalThis.window.confirm(...)` twice in sequence (save? then discard?).

**Likely cause.** `window.confirm` in Electron is synchronous and modal to the renderer; when invoked from a Semi-UI `Button` click inside a focus-trapped toolbar it can be suppressed or return `false` immediately after the first dialog in the same session (Chromium's "prevent this page from creating additional dialogs" heuristic). Either way, native `confirm()` is the wrong tool.

**Fix.** Replace both `window.confirm` calls with a single Electron-native dialog via a new IPC `dialog:unsaved-changes` that calls `dialog.showMessageBox(window, { type: 'warning', buttons: ['Save', "Don't Save", 'Cancel'], defaultId: 0, cancelId: 2, message: 'Save changes to <title>?', detail: '...' })`. Return the index. Use the same helper for Open ERD Project, Reverse Engineer import, and window close (`before-quit`). Two-step OK/Cancel chains ("Save before continuing?" → "Discard?") are replaced with the standard three-button macOS sheet.

**Done when:** New/Open/Import with dirty state always shows the sheet; "Don't Save" proceeds; "Cancel" leaves the document untouched; the guard is covered by an Electron runtime test.

---

### S1-05 · "Unsaved changes" and "Last saved" are wrong  **[P1]**

**Observed.**
- Immediately after **Open ERD Project** of an unchanged file, the chip says "Unsaved changes".
- Immediately after **New ERD Project** (empty diagram), the chip says "Unsaved changes".
- After **Save As** at 4:57 PM, the chip said "Last saved 9/3/2026, 4:53:06 PM" — and still said 4:53 after another Save As at 5:01 PM.
- On first launch a "Saving…" spinner with a rotating icon stayed on screen for several minutes with an empty diagram.

**Code.** The chip is drawDB's `ControlPanel.jsx` L2157 rendering `lastSaved`, which is set only by drawDB's IndexedDB autosave in `Workspace.jsx` L172/207/230/269. ERD Tool's native saves (`saveProject`, `saveProjectAs` in `ErdToolActions.jsx`) update `savedNativeRevision` but never `lastSaved`. The dirty flag comes from comparing `diagramRevision(currentDiagram())` against `savedNativeRevision`; `applyDiagram` on open sets the diagram before the revision snapshot is taken (or the snapshot includes `transform`, which changes on the fit-to-window applied after load).

**Fix.**
- Single source of truth: a `DocumentState` context `{ path, savedRevision, lastSavedAt, dirty }` owned by ERD Tool. Native save/save-as/open/new all write it. Drawdb's IndexedDB autosave still runs (it is the crash-recovery cache) but must not touch the chip.
- Exclude `transform` (pan/zoom) and table `x/y` from the dirty hash unless the user actually dragged (or include layout but snapshot *after* the post-load fit).
- Chip states: `Saved · 5:01 PM`, `Unsaved changes`, `Never saved`. Remove the "Saving…" spinner for IndexedDB writes (they take milliseconds); show it only during native file I/O.

**Done when:** open → chip says Saved with the file's mtime; new → "Never saved"; edit → Unsaved; save → Saved with the current time.

---

## 3. Sprint 2 — Snowflake fidelity and workflow (est. 5–6 dev-days)

### S2-01 · Let the user set the target database and schema (namespace editor)  **[P1]**

**Observed.** A new project's DDL is hard-wired to `CREATE DATABASE IF NOT EXISTS MODEL; CREATE SCHEMA IF NOT EXISTS MODEL.PUBLIC;` and every table is `MODEL.PUBLIC.X`. There is no UI to change this; the diagram title ("Untitled ERD Project") is not used. Imported projects get the title `ERD_TOOL_CHINOOK.PUBLIC`, which reads as the namespace but is not editable as one.

**Fix.** Add a "Model" section at the top of the Tables tab (or a toolbar "Model settings…" dialog) with Database and Schema inputs, validated with `toSnowflakeIdentifier`. Persist as the canonical `namespaces[0]` (the model already supports namespaces — `projectAdapter.js` L1124, `context.md` "multi-schema models"). Tables show their namespace when the model has more than one. Deploy (S1-03) uses this as the default target.

### S2-02 · Complete the Snowflake type list  **[P1]**

**Observed.** The field type dropdown offers exactly seven types: NUMBER, FLOAT, VARCHAR, DATE, TIMESTAMP_NTZ, BOOLEAN, BINARY (`src/data/datatypes.js` L2247–2352 `snowflakeTypesBase`). Missing: `TIMESTAMP_LTZ`, `TIMESTAMP_TZ`, `TIME`, `VARIANT`, `OBJECT`, `ARRAY`, `GEOGRAPHY`, `GEOMETRY`, `VECTOR`, and the common aliases (`INT`, `INTEGER`, `BIGINT`, `STRING`, `TEXT`, `DECIMAL`, `DOUBLE`, `DATETIME`, `TIMESTAMP`). Reverse engineering *does* map some of these (a `TIMESTAMP_NTZ(9)` column imported fine), so an imported `VARIANT` column would show a type the editor cannot re-select.

**Fix.** Extend `snowflakeTypesBase` with the full Snowflake list: canonical types with `hasPrecision`/`hasScale`/`hasSize` flags; aliases map to canonical on selection (`INT` → `NUMBER(38,0)`, `STRING` → `VARCHAR`). Validate that `normalizeColumnType` in `snowflakeService.js` and `renderCanonicalSnowflakeDDL` handle every entry (round-trip unit test: each type → DDL → import parser → same type).

### S2-03 · Remove non-Snowflake field options; default VARCHAR size  **[P2]**

**Observed.** The field "…" popover offers **Check expression** ("will appear in the generated script as is") and **Autoincrement**, and the relationship panel offers **On update / On delete** actions. Snowflake ignores CHECK constraints entirely and never enforces referential actions. New VARCHAR fields default to `VARCHAR(255)`.

**Fix.** When `database === DB.SNOWFLAKE`: hide Check expression and On update/On delete; keep Autoincrement but emit it as `AUTOINCREMENT START 1 INCREMENT 1` (verify the renderer already does); default VARCHAR size to blank (renders as `VARCHAR`, i.e. 16 MB) with placeholder "16777216 (default)". Files: `EditorSidePanel/TablesTab/FieldDetails.jsx` L175–185 renders the check box only when `resolved.hasCheck` is true — so the fix is to set `hasCheck: false` on every entry in `snowflakeTypesBase` (`data/datatypes.js` L2247+) rather than special-casing the component; `RelationshipsTab/RelationshipInfo.jsx` L300–330 for the referential-action selects; `data/datatypes.js` VARCHAR `defaultSize`.

### S2-04 · Reverse-engineer dialog: remember profile, clear stale errors, pick a populated schema  **[P2]**

> **Added 2026-09-03 (live Mac finding):** the profile loader in `src/electron/snowflakeService.js` (~L190-240, `readProfileFiles`) does not expand `~` in `private_key_file`, so a CLI-style path `~/.snowflake/keys/x.p8` fails with `ENOENT: no such file or directory, open '~/.snowflake/keys/x.p8'` even though `snow` itself accepts it. Expand a leading `~/` against `homeDirectory` when normalising profile options, and surface the resolved path in the error.


**Observed.**
- Every time the dialog opens it resets to the (failing) default profile and requires reconnecting; the previous session is discarded on close (`SnowflakeReverseEngineer.jsx` L43–53 all `useState` locals).
- After a failed connect, changing the Profile dropdown leaves the red error banner from the *previous* profile on screen until the next Connect.
- Errors are shown raw: `Error invoking remote method 'snowflake:connect': Error: [SNOWFLAKE_CONNECTION_FAILED] JWT token is invalid. [a1a52078-…]` — Electron IPC prefix and request id leak through.
- After selecting a database the Schema defaults to `PUBLIC` even when PUBLIC is empty ("No supported permanent tables were found") while `CHINOOK` has 11 tables.
- Dialog "Connected to GC33251" shows the account alias while the profile row showed `mngpxma-rq97177`; harmless but confusing.

**Fix.** Persist `lastProfileId`, `lastDatabase`, `lastSchema` in the existing Electron `safeStorage`-backed settings (not localStorage; not the project file). Keep the session alive in main until explicit Disconnect or app quit, and re-open the dialog in the "connected" state if the session is still valid (ping with `SELECT 1`). `setError("")` on profile change (L110 already does this for some paths — apply to all inputs). Strip the `Error invoking remote method '…': Error: ` prefix in `messageFor` and move the request id to a "Details" disclosure. Default schema = first schema with `SHOW TERSE TABLES` count > 0, else PUBLIC. Show `account · user · role · warehouse` consistently in both states.

### S2-05 · Reverse-engineer import: merge vs replace, and layout  **[P2]**

**Observed.** Importing into a diagram that already had a table silently replaced everything (after the unsaved-changes guard). Imported tables land off-viewport (bottom-right) at 100% zoom, so the first thing the user sees is empty canvas; they must find Fit-to-window. "Auto Layout" with zero relationships produced a grid with one table (EMPLOYEES) placed a full row below the others with a large gap.

**Fix.** Add an import mode radio: **Replace diagram** / **Add to diagram** (skip tables whose name already exists; report skipped). After import, run auto layout and then fit-to-window automatically (both already exist: `runAutoLayout`, the "Fit window / Reset" action). For ELK with no edges, use a `org.eclipse.elk.box` or `elk.rectpacking` algorithm rather than `layered` so unconnected tables pack evenly.

### S2-06 · Project file extension and dialog filters  **[P2]**

**Observed.** Save As with the name `claude-qa-model.erd.json` produced `claude-qa-model.erd.json.json`. Filters in `src/electron/main.ts` L25 are `["erd.json", "json"]`; macOS treats the extension as `json` and appends it because it doesn't recognise the compound `.erd.json`.

**Fix.** Use a single-segment extension: `.erdproj` (or `.erd`). Filters `[{ name: "ERD Tool Project", extensions: ["erdproj"] }, { name: "JSON", extensions: ["json"] }]`. Keep opening legacy `.erd.json`. Register the UTI in `electron-builder` `fileAssociations` so double-clicking a project opens the app.

### S2-07 · Column naming and identifier casing on new tables/fields  **[P3]**

**Observed.** Add table creates `table_NGr3AXHpHc2HHrtNZolg4` (nanoid) with a field `id` — lower-case, which becomes a quoted identifier headache in Snowflake, and the random suffix is unreadable in the DDL preview. `DiagramContext.jsx` L39–58.

**Fix.** Name new tables `TABLE_1`, `TABLE_2`, … (next unused ordinal), new fields `COLUMN_1`, and the seed PK `ID`. Upper-case identifiers on blur when database is Snowflake unless the user typed a quoted identifier.

---

## 4. Sprint 3 — Visual and UX polish (est. 4–5 dev-days)

### S3-01 · Toolbar overflow  **[P1 visual]**

**Observed.** At 1280 px width the toolbar clips "Snowflake D…"; at 1372 px it clips "Reverse Eng…"; after a save the "Last saved 9/3/2026, 4:53:06 PM" chip grows and pushes the Reverse Engineer button fully off-screen. There is no horizontal scroll or overflow menu. The primary action of the app is the one that disappears.

**Fix.** In `ErdToolActions.jsx` L540–610 the buttons live in a `flex items-center gap-1` row inside the header. Move the ERD Tool actions to their own row under the drawDB header (or replace the drawDB header entirely — see S3-05), use `flex-wrap`, and collapse to icon-only buttons with tooltips below 1200 px. Shorten the chip to `Saved 5:01 PM`. Make "Reverse Engineer" and "Deploy" primary buttons that never collapse.

### S3-02 · Side-panel tab strip scrolls the "Tables" tab out of view  **[P1 visual]**

**Observed.** After import (and again after New Project) the tab strip shows `‹  |)  Relationships (0)  Subject areas (0)  ›` — the "Tables (11)" tab is scrolled off to the left with just a `)` glyph peeking out. It reappears only after clicking the chevron. Reproducible on every diagram load.

**Fix.** The Semi `Tabs` with `collapsible` scrolls to the active tab on mount before the panel has its final width. In `EditorSidePanel/SidePanel.jsx`, either drop `collapsible` and let the four tabs wrap/shrink (the panel is 350 px; four short labels fit if counts move into badges), or call `scrollToActiveTab` in a `useLayoutEffect` after width settles. Prefer: `Tables · Relationships · Areas · Notes` as icon+label with count badges.

### S3-03 · Column names truncated in tables on canvas  **[P1 visual]**

**Observed.** With `NUMBER(38,0)` / `TIMESTAMP_NTZ(9)` types the fixed 200-px table width leaves ~40 px for the name: `ARTIS…`, `CUS…`, and for EMPLOYEES the names `BIRTHDATE` and `HIREDATE` render as a single letter `B` and `H`. Every Chinook table is affected. The sidebar field editor has the same problem: names show as `ALBUMI`, `CUSTON`, types as `NUM…`.

**Fix.** Canvas (`EditorCanvas/Table.jsx`): compute table width from content — `max(220, longestName + longestType + gutters)`; there is already a `Settings → Table width` option, make it the *minimum*. Alternatively render the type on a second line under the name when the name would be truncated. Sidebar (`TablesTab/TableField.jsx`): widen the panel to 420 px or stack name/type on two rows; show full type in a tooltip on hover.

### S3-04 · New tables stack at the same coordinates  **[P2 visual]**

**Observed.** Second "Add table" placed the new table exactly over the first (same x/y), so the user sees one table and a count of 2. New tables are also placed at a fixed bottom-right point regardless of viewport.

**Fix.** In `DiagramContext.jsx` `addTable`, place at viewport centre (`transform.pan` + half viewport / zoom), then offset by 24 px per existing table that overlaps. Select and scroll the sidebar to the new table (the sidebar already has `scroll_table_${id}` anchors).

### S3-05 · Reconcile drawDB web chrome with ERD Tool desktop chrome  **[P2 UX]**

**Observed.** Two competing menus: the in-window drawDB `File` menu (New, New window, Open `Ctrl+O`, Open Recent, Save `Ctrl+S`, Save as `Ctrl+Shift+S`, Save as template, Rename, Delete diagram, Import from, Import from SQL, Export SQL, Export as, Exit) — all of which act on browser IndexedDB "diagrams", show Windows shortcut labels on macOS, and include "Exit" — alongside the ERD Tool toolbar (New/Open/Save/Save As ERD Project) that acts on native files. The breadcrumb "Diagrams / ERD_TOOL_DEMO.CHINOOK" refers to the drawDB diagram list, not the file. The macOS menu bar's own File menu has only "Close Window / Close All".

**Fix (decide once):** the native file is the document. Move the drawDB File menu's genuinely useful items into the macOS menu bar (File: New, Open…, Open Recent, Save, Save As…, Export ▸ SQL/PNG/SVG/PDF/JSON/DBML/Mermaid/Markdown, Import ▸ SQL/JSON/DBML; Edit; View; Diagram; Connections; Help) with `Cmd` shortcuts, and remove the in-window `File/Edit/View/Settings/Help` strip or reduce it to `Settings` and `Help`. Drop "Save as template", "Delete diagram", "New window", "Exit". Rename the breadcrumb to the file name (`claude-qa-model.erdproj — Edited`).

### S3-06 · Popovers and hover state stick  **[P2 visual]**

**Observed.**
- The zoom-level popover ("Fit window / Reset … 300%") stays open after choosing a value and does not close on Escape; it closes only on an outside click.
- Field hover tooltips ("CUSTOMER_ID NUMBER(38,0) · Not null · Default: Not set · Comment: Not set") remain on screen after a modal closes over them, until the mouse re-enters and leaves the table.
- Clicking a collapsed table header in the sidebar sometimes selects the *next* table's name text (seen as "ARTISTS" highlighted after expanding ALBUMS) — `user-select` is not disabled on the header row.

**Fix.** Zoom popover: close on select and on Escape. Tooltip: reset `hoveredField` when any modal opens (`Modal` `onOpen` → `setHoveredTable(null)`) and on `mouseleave` of the canvas. Add `select-none` to sidebar table headers.

### S3-07 · Relationship label collides with tables  **[P3 visual]**

**Observed.** The FK name label (`fk_ORDERS_CUSTOMER_ID_CUSTOMER`) is drawn at the edge midpoint and overlaps the CUSTOMER table header; the orthogonal edge itself routes under the label.

**Fix.** Hide FK names on canvas by default (show on hover/selection, and always in the side panel); when shown, place the label with a white background pill at the segment furthest from either table.

### S3-08 · Issues panel eats the sidebar  **[P3 visual]**

**Observed.** With 11 issues the Issues drawer takes ~45 % of the sidebar height, leaving four table rows visible. The issue text is a plain list with no click-to-navigate.

**Fix.** Cap Issues at 25 % height with its own scroll; make each row clickable to select/scroll the offending table; add a "Fix: add primary key" quick action where applicable; collapse by default when count is 0.

### S3-09 · Minor visual nits  **[P3]**

- About dialog uses a different logo (circle-crosshair) from the app icon (database stack) — pick one.
- "New ERD project created" / "ERD project saved" toasts render on top of the toolbar and hide the Save buttons for 3 s; move toasts to bottom-centre.
- Code tab (DBML) shows `number` / `varchar` without precision or length, and `headercolor: #175e7a` on every table; either render Snowflake-faithful DBML (`number(38,0)`, `varchar(120)`) or label the tab "DBML (approximate)".
- Empty-state illustration ("No tables — Start building your diagram!") is the drawDB mascot; fine, but the "+" hotspot on it does nothing when clicked — wire it to Add table.
- The `?` nullable toggle and the key icon in the field row have no tooltip.

---

## 5. Sprint 4 — Test harness so this does not regress (est. 2–3 dev-days)

### S4-01 · Live Snowflake round-trip test
A single Playwright/Electron test, env-gated on `ERD_TOOL_LIVE_PROFILE`, that: creates a model with 3 tables, 2 FKs (one composite), one of each Snowflake type; Deploys to `ERD_TOOL_QA.<run-id>`; Reverse Engineers the same schema into a new project; asserts canonical-project equality (ignoring layout and ids); drops the schema. Runs nightly and before release.

### S4-02 · Relationship direction property test
For random pairs of tables with/without PK on either end and both drag directions, assert canvas cardinality ends, side-panel labels, and DDL FK owner are consistent (S1-02).

### S4-03 · Document-state test
Open → not dirty; New → never saved; edit → dirty; Save → not dirty + timestamp; Open dirty guard shows the 3-button sheet (S1-04, S1-05).

### S4-04 · Visual regression snapshots
Playwright screenshots at 1280 and 1440 px of: empty state, Chinook import, dark mode, DDL dialog, RE dialog (disconnected / error / connected). Fail on toolbar clipping (assert the last toolbar button's right edge < viewport width).

### S4-05 · Build provenance
`npm run dist` embeds git SHA; About shows it; a release checklist step diffs the DMG's `main.cjs` hash against the CI build.

---

## 6. Suggested sprint order and dependencies

```
S1-01 (RE keys)   ─┐
S1-02 (FK dir)     ├─► S1-03 (Deploy) ─► S4-01 (round-trip test)
S2-01 (namespace) ─┘
S1-04 (confirm) ─► S1-05 (doc state) ─► S4-03
S3-01, S3-02, S3-03 can start immediately (pure UI)
S3-05 (chrome) after S1-03 so the new menu includes Deploy
```

Ship criterion for the sprint set: a modeler can (1) reverse-engineer a keyed Snowflake schema and see its relationships, (2) build a new model with correct FK direction, (3) deploy it to Snowflake from the app, (4) reverse-engineer it back and get the same model, and (5) never lose work to a silent "New" or a lying "Saved" chip.

---

## Appendix A — Full defect list (for tracking)

| ID | Sev | Area | One-line |
|----|-----|------|----------|
| S1-01 | P0 | RE | Confirmed: 0 PKs / 0 FKs imported from a schema that now has 11 of each; run `scripts/re-diagnose.mjs` to locate the empty array |
| S1-02 | P0 | FE | FK direction reversed when dragging PK→FK; swap flips canvas markers |
| S1-03 | P0 | FE | No deploy; DDL preview has no copy/save; shipped build lacks Connections menu |
| S1-04 | P1 | Files | New ERD Project silently no-ops with unsaved changes |
| S1-05 | P1 | Files | "Unsaved changes" after open/new; "Last saved" stale; perpetual "Saving…" |
| S2-01 | P1 | Model | No way to set target database/schema; hard-wired MODEL.PUBLIC |
| S2-02 | P1 | Types | Only 7 Snowflake types selectable |
| S2-03 | P2 | Types | Check expression / On update / On delete shown for Snowflake; VARCHAR(255) default |
| S2-04 | P2 | RE | Dialog forgets profile/session; stale error banner; raw IPC error text; defaults to empty PUBLIC |
| S2-05 | P2 | RE | Import replaces diagram; lands off-viewport; ELK gap with no edges |
| S2-06 | P2 | Files | `.erd.json.json` double extension |
| S2-07 | P3 | Model | nanoid table names; lower-case `id` |
| S3-01 | P1 | Visual | Toolbar overflow hides Reverse Engineer |
| S3-02 | P1 | Visual | Tables tab scrolled out of tab strip |
| S3-03 | P1 | Visual | Column names truncated to 1–5 chars on canvas and sidebar |
| S3-04 | P2 | Visual | New tables stack at same point |
| S3-05 | P2 | UX | Two File menus / two save systems; Windows shortcuts; "Exit" |
| S3-06 | P2 | Visual | Zoom popover and hover tooltips stick; header text gets selected |
| S3-07 | P3 | Visual | FK label overlaps table |
| S3-08 | P3 | Visual | Issues panel too tall; not navigable |
| S3-09 | P3 | Visual | Logo mismatch, toast placement, DBML precision, empty-state hotspot, missing tooltips |

## Appendix B — What was not tested

Terraform round trip, LLM schema authoring, non-Snowflake databases, Subject areas / Notes / Enums tabs beyond confirming they render, keyboard shortcuts, multi-window, Windows build, large schemas (SNOWFLAKE_SAMPLE_DATA.TPCDS_SF10TCL was available but not imported — recommended as a follow-up performance test for S2-05).
