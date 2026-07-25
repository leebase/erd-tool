import { useContext } from "react";
import { ConversationalAuthoringContext } from "../context/ConversationalAuthoringContext";

export default function useConversationalAuthoring() {
  return useContext(ConversationalAuthoringContext);
}
