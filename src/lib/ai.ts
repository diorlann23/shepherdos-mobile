import { api } from './api';

/**
 * The AI assistant on the ShepherdOS server. Both need a connection; the phone
 * waits for the whole answer (up to two minutes) rather than streaming it.
 */
export interface AiAnswer {
  text: string;
  refused: boolean;
}

const AI_TIMEOUT_MS = 120_000;

/** A short written summary of a report, run again on the server with this person's permissions. */
export const summariseReport = (key: string, filters: Record<string, unknown>) =>
  api<AiAnswer>('/ai/report-summary', { method: 'POST', body: { key, filters }, timeoutMs: AI_TIMEOUT_MS });

export interface GuideTurn {
  question: string;
  answer: string;
}

/** "How do I…?" answered from the ShepherdOS user guide. Only the question is sent. */
export const askGuide = (question: string, history: GuideTurn[]) =>
  api<AiAnswer>('/ai/guide', { method: 'POST', body: { question, history: history.slice(-3) }, timeoutMs: AI_TIMEOUT_MS });
