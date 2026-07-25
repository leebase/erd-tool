import {
  diagramToLogicalModel,
  diffLogicalModels,
  validateLogicalModel,
} from "./logicalModel.js";

const MAX_PROMPT_LENGTH = 10_000;
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;

function fail(message) {
  throw new Error(`[LLM_INVALID_REQUEST] ${message}`);
}

export function createSchemaAuthoringRequest(diagram, prompt) {
  if (typeof prompt !== "string" || !prompt.trim()) {
    fail("Describe the schema change you want");
  }
  const normalizedPrompt = prompt.trim();
  if (normalizedPrompt.length > MAX_PROMPT_LENGTH) {
    fail(`Prompt exceeds the ${MAX_PROMPT_LENGTH} character limit`);
  }
  const currentModel = diagramToLogicalModel(diagram);
  const request = {
    prompt: normalizedPrompt,
    database: diagram.database,
    currentModel,
  };
  if (BufferLikeByteLength(JSON.stringify(request)) > MAX_REQUEST_BYTES) {
    fail("Current diagram is too large for conversational authoring");
  }
  return request;
}

function BufferLikeByteLength(value) {
  if (typeof TextEncoder === "function") {
    return new TextEncoder().encode(value).byteLength;
  }
  return value.length;
}

export function parseSchemaProposal(value, database) {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error("[LLM_INVALID_PROPOSAL] Proposal is not valid JSON");
    }
  }
  return validateLogicalModel(parsed, database);
}

export function proposalPreview(diagram, proposalValue) {
  const current = diagramToLogicalModel(diagram);
  const proposal = parseSchemaProposal(proposalValue, diagram.database);
  return {
    proposal,
    changes: diffLogicalModels(current, proposal, diagram.database),
  };
}

export function editableProposalText(proposal) {
  return `${JSON.stringify(proposal, null, 2)}\n`;
}
