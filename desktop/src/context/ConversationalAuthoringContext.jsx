import { createContext, useMemo, useState } from "react";

export const ConversationalAuthoringContext = createContext({
  panelOpen: true,
  setPanelOpen: () => {},
  pendingProposal: null,
  pendingChanges: [],
  setPendingProposal: () => {},
  clearPendingProposal: () => {},
});

export default function ConversationalAuthoringContextProvider({ children }) {
  const [panelOpen, setPanelOpen] = useState(true);
  const [pendingProposal, setPendingProposalValue] = useState(null);
  const [pendingChanges, setPendingChanges] = useState([]);

  const value = useMemo(
    () => ({
      panelOpen,
      setPanelOpen,
      pendingProposal,
      pendingChanges,
      setPendingProposal(proposal, changes) {
        setPendingProposalValue(proposal);
        setPendingChanges(changes);
      },
      clearPendingProposal() {
        setPendingProposalValue(null);
        setPendingChanges([]);
      },
    }),
    [panelOpen, pendingChanges, pendingProposal],
  );

  return (
    <ConversationalAuthoringContext.Provider value={value}>
      {children}
    </ConversationalAuthoringContext.Provider>
  );
}
