import { useEffect, useMemo, useRef, useState } from "react";
import { Banner, Button, Tag, TextArea, Toast } from "@douyinfe/semi-ui";
import { nanoid } from "nanoid";
import {
  useConversationalAuthoring,
  useDiagram,
  useLayout,
  useSaveState,
  useUndoRedo,
} from "../hooks";
import { Action, ObjectType, State } from "../data/constants";
import {
  createSchemaAuthoringRequest,
  editableProposalText,
  parseSchemaProposal,
  proposalPreview,
} from "../erdTool/conversationalSchemaAuthoring";
import {
  applyLogicalModel,
  diagramToLogicalModel,
} from "../erdTool/logicalModel";
import {
  clearDesktopLlmApiKey,
  getDesktopLlmStatus,
  hasDesktopLlm,
  proposeDesktopSchema,
  setDesktopLlmApiKey,
} from "../erdTool/desktopBridge";

function diagramSnapshot(database, tables, relationships) {
  return { database, tables, relationships };
}

function diagramSignature(diagram) {
  return JSON.stringify(diagramToLogicalModel(diagram));
}

export default function ConversationalSchemaAuthoring() {
  const { layout } = useLayout();
  const {
    database,
    tables,
    setTables,
    relationships,
    setRelationships,
  } = useDiagram();
  const { setUndoStack, setRedoStack } = useUndoRedo();
  const { setSaveState } = useSaveState();
  const {
    panelOpen,
    setPanelOpen,
    pendingProposal,
    pendingChanges,
    setPendingProposal,
    clearPendingProposal,
  } = useConversationalAuthoring();
  const [status, setStatus] = useState(null);
  const [apiKey, setApiKey] = useState("");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [proposalText, setProposalText] = useState("");
  const [baseSignature, setBaseSignature] = useState("");
  const desktopAvailable = hasDesktopLlm();
  const diagram = useMemo(
    () => diagramSnapshot(database, tables, relationships),
    [database, relationships, tables],
  );
  const latestDiagramSignature = useRef("");
  latestDiagramSignature.current = diagramSignature(diagram);

  useEffect(() => {
    if (!desktopAvailable) return;
    let active = true;
    getDesktopLlmStatus()
      .then((next) => {
        if (active) setStatus(next);
      })
      .catch((nextError) => {
        if (active) setError(nextError?.message || "Could not read AI status");
      });
    return () => {
      active = false;
    };
  }, [desktopAvailable]);

  if (!desktopAvailable) return null;

  const configure = async () => {
    setError("");
    try {
      const next = await setDesktopLlmApiKey(apiKey);
      setStatus(next);
      setApiKey("");
      Toast.success("OpenAI API key saved securely");
    } catch (nextError) {
      setError(nextError?.message || "Could not save the API key");
    }
  };

  const clearKey = async () => {
    setError("");
    try {
      setStatus(await clearDesktopLlmApiKey());
      setApiKey("");
      Toast.success("OpenAI API key removed");
    } catch (nextError) {
      setError(nextError?.message || "Could not remove the API key");
    }
  };

  const generate = async () => {
    setError("");
    setBusy(true);
    const requestDiagram = diagramSnapshot(database, tables, relationships);
    let request;
    try {
      request = createSchemaAuthoringRequest(requestDiagram, prompt);
      const signature = diagramSignature(requestDiagram);
      const result = await proposeDesktopSchema(request);
      if (signature !== latestDiagramSignature.current) {
        throw new Error(
          "The diagram changed while the proposal was generated. Run the request again.",
        );
      }
      const preview = proposalPreview(requestDiagram, result.proposal);
      setPendingProposal(preview.proposal, preview.changes);
      setProposalText(editableProposalText(preview.proposal));
      setBaseSignature(signature);
      setEditing(false);
      setPrompt("");
      if (preview.changes.length === 0) {
        Toast.info("The proposal makes no schema changes");
      }
    } catch (nextError) {
      setError(nextError?.message || "Could not generate a schema proposal");
    } finally {
      setBusy(false);
    }
  };

  const accept = () => {
    setError("");
    if (layout.readOnly) {
      setError("The current diagram is read-only");
      return;
    }
    try {
      if (baseSignature !== diagramSignature(diagram)) {
        throw new Error(
          "The diagram changed after this proposal was created. Generate a fresh proposal.",
        );
      }
      const parsed = parseSchemaProposal(proposalText, database);
      const preview = proposalPreview(diagram, parsed);
      const next = applyLogicalModel(diagram, preview.proposal, {
        idFactory: () => nanoid(),
      });
      const undoTables = tables;
      const undoRelationships = relationships;
      setTables(next.tables);
      setRelationships(next.relationships);
      setUndoStack((previous) => [
        ...previous,
        {
          action: Action.EDIT,
          element: ObjectType.NONE,
          component: "conversational_schema",
          undo: {
            tables: undoTables,
            relationships: undoRelationships,
          },
          redo: {
            tables: next.tables,
            relationships: next.relationships,
          },
          message: `AI schema: ${next.summary}`,
        },
      ]);
      setRedoStack([]);
      setSaveState(State.SAVING);
      clearPendingProposal();
      setProposalText("");
      setBaseSignature("");
      setEditing(false);
      Toast.success("Schema proposal accepted");
    } catch (nextError) {
      setError(nextError?.message || "Could not apply the schema proposal");
    }
  };

  const validateEdit = () => {
    setError("");
    try {
      const preview = proposalPreview(diagram, proposalText);
      setPendingProposal(preview.proposal, preview.changes);
      setProposalText(editableProposalText(preview.proposal));
      setEditing(false);
      Toast.success("Edited proposal is valid");
    } catch (nextError) {
      setError(nextError?.message || "Proposal JSON is invalid");
    }
  };

  const reject = () => {
    clearPendingProposal();
    setProposalText("");
    setBaseSignature("");
    setEditing(false);
    setError("");
    Toast.info("Schema proposal rejected");
  };

  if (!panelOpen) {
    return (
      <div className="flex w-12 shrink-0 items-start justify-center border-l border-color pt-3">
        <Button
          size="small"
          type="primary"
          aria-label="Open AI schema authoring"
          onClick={() => setPanelOpen(true)}
        >
          AI
        </Button>
      </div>
    );
  }

  return (
    <aside
      className="flex w-[360px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-color bg-primary p-4"
      aria-label="Conversational schema authoring"
      data-testid="llm-schema-panel"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold">AI Schema Authoring</div>
          <div className="text-xs text-gray-500">
            Proposals never change the diagram until you accept.
          </div>
        </div>
        <Button
          size="small"
          type="tertiary"
          aria-label="Close AI schema authoring"
          onClick={() => setPanelOpen(false)}
        >
          ×
        </Button>
      </div>

      {error && (
        <Banner
          type="danger"
          fullMode={false}
          description={error}
          closeIcon={null}
        />
      )}

      <div className="rounded-md border border-color p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium">OpenAI provider</span>
          <Tag color={status?.configured ? "green" : "grey"}>
            {status?.configured ? status.model : "Not configured"}
          </Tag>
        </div>
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded border border-color bg-primary px-2 py-1 text-sm"
            type="password"
            autoComplete="off"
            aria-label="OpenAI API key"
            placeholder="sk-…"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
          <Button
            size="small"
            disabled={!apiKey.trim()}
            onClick={() => void configure()}
          >
            Save key
          </Button>
        </div>
        {status?.configured && (
          <Button
            className="mt-2"
            size="small"
            type="tertiary"
            onClick={() => void clearKey()}
          >
            Remove saved key
          </Button>
        )}
      </div>

      <TextArea
        value={prompt}
        onChange={setPrompt}
        autosize={{ minRows: 4, maxRows: 10 }}
        disabled={busy || Boolean(pendingProposal)}
        placeholder="Describe tables, columns, keys, and relationships…"
        data-testid="llm-schema-prompt"
      />
      <Button
        theme="solid"
        type="primary"
        loading={busy}
        disabled={
          busy ||
          Boolean(pendingProposal) ||
          !status?.configured ||
          !prompt.trim() ||
          layout.readOnly
        }
        onClick={() => void generate()}
        data-testid="llm-generate-proposal"
      >
        Generate proposal
      </Button>

      {pendingProposal && (
        <div className="space-y-3 rounded-md border border-blue-400 p-3">
          <div>
            <div className="font-medium">Pending proposal</div>
            <div className="text-sm text-gray-500">
              {pendingProposal.summary}
            </div>
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {pendingChanges.length ? (
              pendingChanges.map((change) => (
                <div
                  key={`${change.kind}:${change.object}:${change.key}`}
                  className="flex items-center gap-2 text-sm"
                >
                  <Tag
                    color={
                      change.kind === "add"
                        ? "green"
                        : change.kind === "remove"
                          ? "red"
                          : "amber"
                    }
                  >
                    {change.kind}
                  </Tag>
                  <span>
                    {change.object}: {change.label}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-500">No schema changes</div>
            )}
          </div>
          {editing && (
            <TextArea
              value={proposalText}
              onChange={setProposalText}
              autosize={{ minRows: 10, maxRows: 22 }}
              data-testid="llm-proposal-json"
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              theme="solid"
              type="primary"
              disabled={layout.readOnly || pendingChanges.length === 0}
              onClick={accept}
              data-testid="llm-accept-proposal"
            >
              Accept
            </Button>
            <Button
              onClick={() => (editing ? validateEdit() : setEditing(true))}
              data-testid="llm-edit-proposal"
            >
              {editing ? "Validate edit" : "Edit"}
            </Button>
            <Button
              type="danger"
              onClick={reject}
              data-testid="llm-reject-proposal"
            >
              Reject
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}

export function ConversationalProposalOverlay() {
  const { pendingProposal, pendingChanges } = useConversationalAuthoring();
  if (!pendingProposal) return null;
  return (
    <div
      className="pointer-events-none absolute right-4 top-4 z-30 max-w-sm rounded-lg border-2 border-dashed border-blue-500 bg-blue-50/95 p-3 text-gray-900 shadow-lg"
      data-testid="llm-canvas-diff"
    >
      <div className="font-semibold">Pending AI schema diff</div>
      <div className="text-sm">{pendingProposal.summary}</div>
      <div className="mt-2 text-xs">
        {pendingChanges.length} change{pendingChanges.length === 1 ? "" : "s"}{" "}
        awaiting Accept, Edit, or Reject
      </div>
    </div>
  );
}
