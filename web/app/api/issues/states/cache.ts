import type { WorkflowState } from "./route";

let statesCache: { states: WorkflowState[]; expiresAt: number } | null = null;

export function readStatesCache() {
  return statesCache;
}

export function writeStatesCache(states: WorkflowState[], expiresAt: number) {
  statesCache = { states, expiresAt };
}

export function _resetStatesCache() {
  statesCache = null;
}
