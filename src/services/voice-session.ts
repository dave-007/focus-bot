export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface VoiceSession {
  /** Current note body */
  draft: string;
  /** Current suggested title */
  title: string;
  /** Current tags */
  tags: string[];
  /** Telegram chat ID */
  chatId: number;
  /** Bot's draft message ID (edited in-place) */
  draftMessageId: number;
  /** Conversation history for simulated multi-turn */
  conversationHistory: ConversationTurn[];
}

const sessions = new Map<number, VoiceSession>();

export function getSession(userId: number): VoiceSession | undefined {
  return sessions.get(userId);
}

export function createSession(userId: number, session: VoiceSession): void {
  sessions.set(userId, session);
}

export function updateSession(userId: number, updates: Partial<VoiceSession>): void {
  const session = sessions.get(userId);
  if (session) {
    Object.assign(session, updates);
  }
}

export function deleteSession(userId: number): void {
  sessions.delete(userId);
}

export function hasSession(userId: number): boolean {
  return sessions.has(userId);
}

/**
 * Find the userId that owns a session with the given draftMessageId.
 * Used for reaction-based save (any user can react).
 */
export function findSessionByDraftMessage(chatId: number, messageId: number): { userId: number; session: VoiceSession } | undefined {
  for (const [userId, session] of sessions) {
    if (session.chatId === chatId && session.draftMessageId === messageId) {
      return { userId, session };
    }
  }
  return undefined;
}
