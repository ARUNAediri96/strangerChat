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
export type UserGender = "male" | "female";

interface ChatEvent {
  id: number;
  sessionId: string;
  event: string;
  payload: Record<string, unknown>;
}

interface EventResponse {
  events: ChatEvent[];
}

export interface AppUser {
  id: string;
  email: string;
  username: string;
  emailVerified: boolean;
}

export interface MeetingRoom {
  id: string;
  name: string;
  visibility: "public" | "private";
  joinToken?: string;
  ownerUsername: string;
  ownerSessionId?: string;
  durationDays?: number;
  memberCount?: number;
  createdAt: string;
  expiresAt?: string;
}

export interface FriendRequestPayload {
  id: string;
  status: string;
  createdAt?: string;
  sender: {
    id: string;
    username: string;
  };
}

export interface AssistantReplyRequest {
  conversationId: string;
  sessionId: string;
  userGender: UserGender;
  assistantGender: UserGender;
  personaStyle?: string;
  message: string;
  idleFollowUp?: boolean;
  history: Array<{
    role: "user" | "assistant";
    text: string;
  }>;
}

export interface AssistantReplyResponse {
  messages: string[];
}

export interface IceServersResponse {
  iceServers: RTCIceServer[];
}

type BroadcastHandler = (event: { payload: Record<string, unknown> }) => void;

async function apiCall<T>(path: string, body: object, token?: string | null): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return data;
}

async function apiGet<T>(path: string, token?: string | null): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
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
  mode: ChatMode,
  gender: UserGender
): Promise<MatchResult> {
  return apiCall("/api/match/join", { sessionId, filters, publicKey, mode, gender });
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

export async function requestAssistantMessage(
  request: AssistantReplyRequest
): Promise<AssistantReplyResponse> {
  return apiCall("/api/chat/assistant-message", request);
}

export async function getIceServers(): Promise<RTCIceServer[]> {
  const data = await apiGet<IceServersResponse>("/api/video/ice-servers");
  return data.iceServers;
}

export async function registerAccount(email: string, username: string, password: string) {
  return apiCall<{
    user: AppUser;
    verificationEmailSent: boolean;
    verificationUrl?: string;
  }>("/api/auth/register", { email, username, password });
}

export async function loginAccount(email: string, password: string) {
  return apiCall<{ token: string; user: AppUser }>("/api/auth/login", { email, password });
}

export async function verifyAccountEmail(token: string) {
  return apiCall<{ token: string; user: AppUser }>("/api/auth/verify", { token });
}

export async function getCurrentUser(token: string) {
  return apiCall<{ user: AppUser | null }>("/api/auth/me", {}, token);
}

export async function changeAccountPassword(
  currentPassword: string,
  newPassword: string,
  token: string
) {
  return apiCall<{ success: boolean }>(
    "/api/auth/change-password",
    { currentPassword, newPassword },
    token
  );
}

export async function listPublicRooms(sessionId?: string) {
  const params = sessionId ? `?${new URLSearchParams({ sessionId })}` : "";
  return apiGet<{ rooms: MeetingRoom[] }>(`/api/rooms/public${params}`);
}

export async function createMeetingRoom(
  name: string,
  visibility: "public" | "private",
  username: string,
  sessionId: string,
  durationDays: number
) {
  return apiCall<{ room: MeetingRoom }>("/api/rooms/create", {
    name,
    visibility,
    username,
    sessionId,
    durationDays,
  });
}

export async function joinMeetingRoom(
  username: string,
  sessionId: string,
  options: { roomId?: string; token?: string }
) {
  return apiCall<{ room: MeetingRoom; username: string }>("/api/rooms/join", {
    username,
    sessionId,
    ...options,
  });
}

export async function deleteMeetingRoom(roomId: string, sessionId: string) {
  return apiCall<{ success: boolean }>("/api/rooms/delete", { roomId, sessionId });
}

export async function createFriendRequest(chatId: string, token: string) {
  return apiCall<{ request: FriendRequestPayload }>("/api/friends/request", { chatId }, token);
}

export async function recordIncomingFriendRequest(requestId: string, token: string) {
  return apiCall<{ request: FriendRequestPayload | null; ignored?: boolean }>("/api/friends/receive", { requestId }, token);
}

export async function respondFriendRequest(requestId: string, action: "accept" | "reject", token: string) {
  return apiCall<{ request: { id: string; status: string } }>(
    "/api/friends/respond",
    { requestId, action },
    token
  );
}

export async function listFriendRequests(token: string) {
  return apiCall<{ requests: FriendRequestPayload[] }>("/api/friends/requests", {}, token);
}

export async function listFriends(token: string) {
  return apiCall<{ friends: AppUser[] }>("/api/friends/list", {}, token);
}

export async function openFriendChat(friendId: string, token: string) {
  return apiCall<{ chatId: string }>("/api/friends/chat", { friendId }, token);
}

export function createChatChannel(chatId: string, sessionIdForPolling?: string) {
  const handlers = new Map<string, BroadcastHandler[]>();
  let pollId: ReturnType<typeof setInterval> | null = null;
  let lastEventId = 0;
  let closed = false;
  let polling = false;

  async function poll() {
    if (closed || polling) return;
    polling = true;

    try {
      const params = new URLSearchParams({
        chatId,
        since: String(lastEventId),
      });
      if (sessionIdForPolling) params.set("sessionId", sessionIdForPolling);
      const data = await apiGet<EventResponse>(`/api/chat/events?${params}`);
      if (closed) return;

      for (const item of data.events) {
        lastEventId = Math.max(lastEventId, item.id);
        const eventHandlers = handlers.get(item.event) || [];
        const payload = {
          ...item.payload,
          __event_id: item.id,
          session_id: item.payload.session_id || item.sessionId,
        };

        for (const handler of eventHandlers) {
          handler({ payload });
        }
      }
    } catch (err) {
      console.error("Chat event poll error:", err);
    } finally {
      polling = false;
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
      if (pollId) return this;
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
