import { useState, useEffect, useRef, useCallback } from "react";
import { generateKeyPair, encryptMessage, decryptMessage } from "./encryption";
import {
  joinPool,
  checkMatch,
  leaveChat,
  reportChat,
  createChatChannel,
  type ChatMode,
  type MatchResult,
} from "./match-api";

export type { ChatMode } from "./match-api";

export type ChatStatus =
  | "idle"
  | "generating-keys"
  | "searching"
  | "matched"
  | "disconnected";

export interface ChatMessage {
  id: string;
  text: string;
  isMine: boolean;
  timestamp: number;
}

export interface VideoSignal {
  id: string;
  payload: Record<string, unknown>;
}

export function useChat() {
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [matchedFilters, setMatchedFilters] = useState<string[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const [mode, setMode] = useState<ChatMode>("chat");
  const [isInitiator, setIsInitiator] = useState(false);
  const [videoSignals, setVideoSignals] = useState<VideoSignal[]>([]);

  const sessionIdRef = useRef(crypto.randomUUID());
  const keyPairRef = useRef<{ publicKey: string; privateKey: string } | null>(null);
  const peerPublicKeyRef = useRef<string | null>(null);
  const channelRef = useRef<ReturnType<typeof createChatChannel> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusRef = useRef<ChatStatus>("idle");
  const filtersRef = useRef<string[]>([]);
  const modeRef = useRef<ChatMode>("chat");
  const chatIdRef = useRef<string | null>(null);
  const startSearchingRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    chatIdRef.current = chatId;
  }, [chatId]);

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }
    setPeerTyping(false);
  }, []);

  const setupChannel = useCallback(
    (cId: string) => {
      const channel = createChatChannel(cId);
      channelRef.current = channel;

      channel.on("broadcast", { event: "message" }, (event) => {
        const payload = event.payload;
        if (!payload || payload.session_id === sessionIdRef.current) return;

        // Try encrypted first, fall back to plain text
        const encrypted = payload.encrypted as string | undefined;
        const plain = payload.text as string | undefined;

        if (encrypted && keyPairRef.current && peerPublicKeyRef.current) {
          decryptMessage(
            encrypted,
            keyPairRef.current.privateKey,
            peerPublicKeyRef.current
          )
            .then((text) => {
              setMessages((prev) => [
                ...prev,
                { id: crypto.randomUUID(), text, isMine: false, timestamp: Date.now() },
              ]);
              setPeerTyping(false);
            })
            .catch(() => {
              // Decryption failed, try plain text fallback
              if (plain) {
                setMessages((prev) => [
                  ...prev,
                  { id: crypto.randomUUID(), text: plain, isMine: false, timestamp: Date.now() },
                ]);
                setPeerTyping(false);
              }
            });
        } else if (plain) {
          setMessages((prev) => [
            ...prev,
            { id: crypto.randomUUID(), text: plain, isMine: false, timestamp: Date.now() },
          ]);
          setPeerTyping(false);
        }
      });

      channel.on("broadcast", { event: "typing" }, (event) => {
        const payload = event.payload;
        if (!payload || payload.session_id === sessionIdRef.current) return;
        setPeerTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setPeerTyping(false), 2000);
      });

      channel.on("broadcast", { event: "video-signal" }, (event) => {
        const payload = event.payload;
        if (!payload || payload.session_id === sessionIdRef.current) return;
        setVideoSignals((prev) => [
          ...prev,
          { id: crypto.randomUUID(), payload },
        ]);
      });

      channel.on("broadcast", { event: "disconnect" }, (event) => {
        const payload = event.payload;
        if (!payload || payload.session_id === sessionIdRef.current) return;
        cleanup();
        setMessages([]);
        setChatId(null);
        chatIdRef.current = null;
        setMatchedFilters([]);
        setVideoSignals([]);
        peerPublicKeyRef.current = null;
        // Auto-restart matching
        void startSearchingRef.current?.();
      });

      channel.subscribe();
    },
    [cleanup]
  );

  const applyMatch = useCallback(
    (result: MatchResult) => {
      if (!result.chatId || !result.peerPublicKey) return;

      setChatId(result.chatId);
      chatIdRef.current = result.chatId;
      peerPublicKeyRef.current = result.peerPublicKey;
      setMatchedFilters(result.matchedFilters || []);
      setIsInitiator(Boolean(result.isInitiator));
      if (result.mode) setMode(result.mode);
      setStatus("matched");

      setupChannel(result.chatId);
    },
    [setupChannel]
  );

  const startSearching = useCallback(async () => {
    cleanup();
    setMessages([]);
    setMatchedFilters([]);
    setChatId(null);
    chatIdRef.current = null;
    peerPublicKeyRef.current = null;
    setVideoSignals([]);

    setStatus("generating-keys");
    const keyPair = await generateKeyPair();
    keyPairRef.current = keyPair;

    if (statusRef.current !== "generating-keys") return;

    setStatus("searching");

    const sessionId = sessionIdRef.current;
    const filters = filtersRef.current;
    const selectedMode = modeRef.current;

    try {
      const result = await joinPool(sessionId, filters, keyPair.publicKey, selectedMode);

      if (result.matched && result.chatId && result.peerPublicKey) {
        applyMatch(result);
      } else {
        pollRef.current = setInterval(async () => {
          try {
            const check = await checkMatch(sessionId);
            if (check.matched && check.chatId && check.peerPublicKey) {
              if (pollRef.current) clearInterval(pollRef.current);
              pollRef.current = null;
              applyMatch(check);
            }
          } catch (err) {
            console.error("Poll error:", err);
          }
        }, 2000);
      }
    } catch (err) {
      console.error("Join error:", err);
      setStatus("idle");
    }
  }, [cleanup, applyMatch]);

  startSearchingRef.current = startSearching;

  const startChat = useCallback(
    (filters: string[], selectedMode: ChatMode) => {
      filtersRef.current = filters;
      modeRef.current = selectedMode;
      setMode(selectedMode);
      // New session for each new chat start
      sessionIdRef.current = crypto.randomUUID();
      startSearching();
    },
    [startSearching]
  );

  const sendMessage = useCallback(async (text: string) => {
    if (!channelRef.current || !text.trim()) return;

    const payload: Record<string, string> = {
      session_id: sessionIdRef.current,
      text, // plain text fallback
    };

    // Try to encrypt if keys available
    if (keyPairRef.current && peerPublicKeyRef.current) {
      try {
        const encrypted = await encryptMessage(
          text,
          keyPairRef.current.privateKey,
          peerPublicKeyRef.current
        );
        payload.encrypted = encrypted;
      } catch (err) {
        console.error("Encryption failed, sending plain:", err);
      }
    }

    channelRef.current.send({
      type: "broadcast",
      event: "message",
      payload,
    });

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text, isMine: true, timestamp: Date.now() },
    ]);
  }, []);

  const sendTyping = useCallback(() => {
    if (!channelRef.current) return;
    channelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { session_id: sessionIdRef.current },
    });
  }, []);

  const sendVideoSignal = useCallback((payload: Record<string, unknown>) => {
    if (!channelRef.current) return;
    channelRef.current.send({
      type: "broadcast",
      event: "video-signal",
      payload: { ...payload, session_id: sessionIdRef.current },
    });
  }, []);

  const cancelSearch = useCallback(async () => {
    cleanup();
    await leaveChat(sessionIdRef.current);
    setMessages([]);
    setChatId(null);
    chatIdRef.current = null;
    setMatchedFilters([]);
    setVideoSignals([]);
    peerPublicKeyRef.current = null;
    setStatus("idle");
  }, [cleanup]);

  const skipChat = useCallback(async () => {
    // Notify peer before cleanup
    if (channelRef.current) {
      await channelRef.current.send({
        type: "broadcast",
        event: "disconnect",
        payload: { session_id: sessionIdRef.current },
      });
    }

    const currentChatId = chatIdRef.current;
    cleanup();

    if (currentChatId) {
      await leaveChat(sessionIdRef.current, currentChatId);
    } else {
      await leaveChat(sessionIdRef.current);
    }

    // New session and auto-restart matching
    sessionIdRef.current = crypto.randomUUID();
    setMessages([]);
    setChatId(null);
    chatIdRef.current = null;
    setMatchedFilters([]);
    setVideoSignals([]);
    peerPublicKeyRef.current = null;

    startSearching();
  }, [cleanup, startSearching]);

  const leaveCurrentChat = useCallback(async () => {
    // Notify peer so they can automatically return to matching.
    if (channelRef.current) {
      await channelRef.current.send({
        type: "broadcast",
        event: "disconnect",
        payload: { session_id: sessionIdRef.current },
      });
    }

    const currentChatId = chatIdRef.current;
    cleanup();

    if (currentChatId) {
      await leaveChat(sessionIdRef.current, currentChatId);
    } else {
      await leaveChat(sessionIdRef.current);
    }

    sessionIdRef.current = crypto.randomUUID();
    setMessages([]);
    setChatId(null);
    chatIdRef.current = null;
    setMatchedFilters([]);
    setVideoSignals([]);
    peerPublicKeyRef.current = null;
    setStatus("idle");
  }, [cleanup]);

  const reportAndLeave = useCallback(
    async (reason: string) => {
      const currentChatId = chatIdRef.current;
      if (currentChatId) {
        await reportChat(currentChatId, sessionIdRef.current, reason);
      }
      await skipChat();
    },
    [skipChat]
  );

  useEffect(() => {
    return () => {
      cleanup();
      if (chatIdRef.current) {
        leaveChat(sessionIdRef.current, chatIdRef.current);
      }
    };
  }, [cleanup]);

  return {
    status,
    messages,
    matchedFilters,
    chatId,
    sessionId: sessionIdRef.current,
    peerTyping,
    mode,
    isInitiator,
    videoSignals,
    startChat,
    cancelSearch,
    sendMessage,
    sendTyping,
    sendVideoSignal,
    skipChat,
    leaveCurrentChat,
    reportAndLeave,
  };
}
