import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import {
  createSchemaAuthoringRequest,
  editableProposalText,
  parseSchemaProposal,
  proposalPreview,
} from "../src/erdTool/conversationalSchemaAuthoring.js";

function emptyDiagram() {
  return {
    database: "snowflake",
    tables: [],
    relationships: [],
  };
}

function proposal() {
  return {
    summary: "Create a customer table",
    tables: [
      {
        key: "new:customer",
        name: "CUSTOMER",
        comment: "",
        columns: [
          {
            key: "new:customer-id",
            name: "CUSTOMER_ID",
            type: "NUMBER(38,0)",
            nullable: false,
            primary: true,
            unique: false,
            default: "",
            comment: "",
          },
        ],
      },
    ],
    relationships: [],
  };
}

describe("SS-014 conversational schema authoring workflow", () => {
  it("builds a bounded credential-free request from the current diagram", () => {
    const request = createSchemaAuthoringRequest(
      emptyDiagram(),
      "  Create a customer table  ",
    );
    assert.equal(request.prompt, "Create a customer table");
    assert.equal(request.database, "snowflake");
    assert.deepEqual(request.currentModel.tables, []);
    assert.equal(JSON.stringify(request).includes("apiKey"), false);
  });

  it("supports editable JSON and recomputes a pending diff before acceptance", () => {
    const text = editableProposalText(proposal());
    const parsed = parseSchemaProposal(text, "snowflake");
    const preview = proposalPreview(emptyDiagram(), parsed);
    assert.equal(preview.changes.length, 1);
    assert.deepEqual(preview.changes[0], {
      kind: "add",
      object: "table",
      key: "new:customer",
      label: "CUSTOMER",
    });
  });

  it("exposes explicit Accept, Edit, and Reject controls plus a canvas diff", () => {
    const component = fs.readFileSync(
      new URL(
        "../src/components/ConversationalSchemaAuthoring.jsx",
        import.meta.url,
      ),
      "utf8",
    );
    for (const label of ["Accept", "Edit", "Reject"]) {
      assert.match(component, new RegExp(`\\b${label}\\b`));
    }
    assert.match(component, /data-testid="llm-canvas-diff"/);
    assert.match(component, /component:\s*"conversational_schema"/);
    assert.doesNotMatch(component, /localStorage|sessionStorage/);
  });

  it("uses a fixed preload API instead of exposing generic IPC or secrets", () => {
    const preload = fs.readFileSync(
      new URL("../src/electron/preload.ts", import.meta.url),
      "utf8",
    );
    const bridge = fs.readFileSync(
      new URL("../src/erdTool/desktopBridge.js", import.meta.url),
      "utf8",
    );
    assert.match(preload, /const llm = Object\.freeze/);
    assert.match(preload, /"llm:propose-schema"/);
    assert.match(preload, /"llm:set-api-key"/);
    assert.doesNotMatch(preload, /invoke:\s*ipcRenderer\.invoke/);
    assert.match(bridge, /proposeDesktopSchema/);
  });
});
