const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export interface MatchResult {
  matched: boolean;
  chatId?: string;
  peerPublicKey?: string;
  matchedFilters?: string[];
  isInitiator?: boolean;
  mode?: ChatMode;
  status?: string;
  error?: string;
}

export type ChatMode = "chat" | "video";

interface ChatEvent {
  id: number;
  sessionId: string;
  event: string;
  payload: Record<string, unknown>;
}

interface EventResponse {
  events: ChatEvent[];
}

type BroadcastHandler = (event: { payload: Record<string, unknown> }) => void;

async function apiCall<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return data;
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return data;
}

export async function joinPool(
  sessionId: string,
  filters: string[],
  publicKey: string,
  mode: ChatMode
): Promise<MatchResult> {
  return apiCall("/api/match/join", { sessionId, filters, publicKey, mode });
}

export async function checkMatch(sessionId: string): Promise<MatchResult> {
  return apiCall("/api/match/check", { sessionId });
}

export async function leaveChat(
  sessionId: string,
  chatId?: string
): Promise<void> {
  await apiCall("/api/match/leave", { sessionId, chatId });
}

export async function reportChat(
  chatId: string,
  reporterSession: string,
  reason: string
): Promise<void> {
  await apiCall("/api/match/report", { chatId, reporterSession, reason });
}

export function createChatChannel(chatId: string) {
  const handlers = new Map<string, BroadcastHandler[]>();
  let pollId: ReturnType<typeof setInterval> | null = null;
  let lastEventId = 0;
  let closed = false;

  async function poll() {
    if (closed) return;

    try {
      const params = new URLSearchParams({
        chatId,
        since: String(lastEventId),
      });
      const data = await apiGet<EventResponse>(`/api/chat/events?${params}`);

      for (const item of data.events) {
        lastEventId = Math.max(lastEventId, item.id);
        const eventHandlers = handlers.get(item.event) || [];
        const payload = {
          ...item.payload,
          session_id: item.payload.session_id || item.sessionId,
        };

        for (const handler of eventHandlers) {
          handler({ payload });
        }
      }
    } catch (err) {
      console.error("Chat event poll error:", err);
    }
  }

  return {
    on(_type: "broadcast", options: { event: string }, handler: BroadcastHandler) {
      const eventHandlers = handlers.get(options.event) || [];
      eventHandlers.push(handler);
      handlers.set(options.event, eventHandlers);
      return this;
    },

    async send(options: {
      type: "broadcast";
      event: string;
      payload: Record<string, unknown>;
    }) {
      const sessionId = String(options.payload.session_id || "");
      await apiCall("/api/chat/events", {
        chatId,
        sessionId,
        event: options.event,
        payload: options.payload,
      });
    },

    subscribe() {
      void poll();
      pollId = setInterval(() => {
        void poll();
      }, 500);
      return this;
    },

    unsubscribe() {
      closed = true;
      if (pollId) {
        clearInterval(pollId);
        pollId = null;
      }
    },
  };
}
