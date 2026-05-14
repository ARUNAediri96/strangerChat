import { useState, useRef, useEffect, useCallback } from "react";
import {
  Shield,
  SkipForward,
  Flag,
  LogOut,
  Send,
  Lock,
  WifiOff,
  Loader2,
  Mic,
  MicOff,
  Video,
  VideoOff,
} from "lucide-react";
import ChatBubble from "../components/ChatBubble";
import TypingIndicator from "../components/TypingIndicator";
import ReportModal from "../components/ReportModal";
import SearchAnimation from "../components/SearchAnimation";
import { getIceServers } from "../lib/match-api";
import type { ChatMessage, ChatMode, ChatStatus, VideoSignal } from "../lib/use-chat";

interface ChatPageProps {
  status: ChatStatus;
  messages: ChatMessage[];
  matchedFilters: string[];
  chatId: string | null;
  peerTyping: boolean;
  mode: ChatMode;
  isInitiator: boolean;
  videoSignals: VideoSignal[];
  onSendMessage: (text: string) => void;
  onSendTyping: () => void;
  onSendVideoSignal: (payload: Record<string, unknown>) => void;
  onSkip: () => void;
  onLeave: () => void;
  onReport: (reason: string) => void;
}

export default function ChatPage({
  status,
  messages,
  matchedFilters,
  chatId,
  peerTyping,
  mode,
  isInitiator,
  videoSignals,
  onSendMessage,
  onSendTyping,
  onSendVideoSignal,
  onSkip,
  onLeave,
  onReport,
}: ChatPageProps) {
  const [input, setInput] = useState("");
  const [showReport, setShowReport] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isSearching = status === "searching" || status === "generating-keys";
  const isDisconnected = status === "disconnected";
  const isMatched = status === "matched";

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, peerTyping, scrollToBottom]);

  useEffect(() => {
    if (isMatched) inputRef.current?.focus();
  }, [isMatched]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (value: string) => {
    setInput(value);
    if (value.length > 0) {
      onSendTyping();
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/3 -right-1/3 w-2/3 h-2/3 bg-emerald-500/3 rounded-full blur-[120px]" />
        <div className="absolute -bottom-1/3 -left-1/3 w-2/3 h-2/3 bg-teal-500/3 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/[0.06] bg-gray-950/80 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {isMatched ? (
                <>
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                  <span className="text-white font-semibold text-sm">
                    Stranger {mode === "video" ? "Video" : "Chat"}
                  </span>
                </>
              ) : isSearching ? (
                <>
                  <Loader2 size={14} className="text-emerald-400 animate-spin" />
                  <span className="text-gray-400 text-sm">Finding someone...</span>
                </>
              ) : isDisconnected ? (
                <>
                  <WifiOff size={14} className="text-red-400" />
                  <span className="text-red-400 text-sm">Disconnected</span>
                </>
              ) : null}
            </div>
            {isMatched && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-md">
                <Lock size={10} className="text-emerald-400" />
                <span className="text-[10px] text-emerald-400 font-medium">E2E</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            {isMatched && matchedFilters.length > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 mr-3">
                {matchedFilters.slice(0, 3).map((f) => (
                  <span
                    key={f}
                    className="px-2 py-0.5 text-[10px] text-gray-400 bg-white/5 border border-white/10 rounded-md"
                  >
                    {f}
                  </span>
                ))}
              </div>
            )}
            <button
              onClick={onSkip}
              className="p-2 text-gray-500 hover:text-yellow-400 hover:bg-yellow-400/10 rounded-lg transition-all"
              title="Skip"
            >
              <SkipForward size={18} />
            </button>
            {isMatched && (
              <button
                onClick={() => setShowReport(true)}
                className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                title="Report"
              >
                <Flag size={18} />
              </button>
            )}
            <button
              onClick={onLeave}
              className="p-2 text-gray-500 hover:text-gray-300 hover:bg-white/10 rounded-lg transition-all"
              title="Leave"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Main content area */}
      <main className="flex-1 overflow-y-auto relative z-10">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-3">
          {isSearching && <SearchAnimation />}

          {isMatched && (
            <div className="flex justify-center mb-4">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/[0.03] border border-white/[0.06] rounded-full">
                <Shield size={12} className="text-emerald-400" />
                <span className="text-[11px] text-gray-500">
                  {mode === "video"
                    ? "Video calls connect peer-to-peer in your browser."
                    : "Messages are end-to-end encrypted. No one can read them except you."}
                </span>
              </div>
            </div>
          )}

          {isMatched && mode === "video" && chatId && (
            <VideoCallPanel
              key={chatId}
              isInitiator={isInitiator}
              signals={videoSignals}
              onSignal={onSendVideoSignal}
            />
          )}

          {mode === "chat" && (
            <>
              {messages.map((msg) => (
                <ChatBubble key={msg.id} message={msg} />
              ))}
              {peerTyping && <TypingIndicator />}
            </>
          )}

          {isDisconnected && (
            <div className="flex justify-center py-8">
              <div className="text-center">
                <WifiOff size={32} className="text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Stranger disconnected</p>
                <p className="text-gray-600 text-xs mt-1">Finding you a new match...</p>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input - only show when matched */}
      {isMatched && mode === "chat" && (
        <div className="relative z-10 border-t border-white/[0.06] bg-gray-950/80 backdrop-blur-xl">
          <div className="max-w-3xl mx-auto px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center bg-white/[0.04] border border-white/[0.08] rounded-xl focus-within:border-emerald-400/30 focus-within:ring-1 focus-within:ring-emerald-400/10 transition-all">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2.5 bg-transparent text-white text-sm placeholder-gray-600 outline-none"
                  maxLength={500}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="p-2.5 mr-1 text-emerald-400 hover:text-emerald-300 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ReportModal
        open={showReport}
        onClose={() => setShowReport(false)}
        onReport={(reason) => {
          onReport(reason);
          setShowReport(false);
        }}
      />
    </div>
  );
}

interface VideoCallPanelProps {
  isInitiator: boolean;
  signals: VideoSignal[];
  onSignal: (payload: Record<string, unknown>) => void;
}

function VideoCallPanel({
  isInitiator,
  signals,
  onSignal,
}: VideoCallPanelProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const handledSignalsRef = useRef(new Set<string>());
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [pcReady, setPcReady] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("Starting camera...");
  const [mediaError, setMediaError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function flushCandidates() {
      const pc = pcRef.current;
      if (!pc?.remoteDescription) return;
      const candidates = pendingCandidatesRef.current.splice(0);
      for (const candidate of candidates) {
        await pc.addIceCandidate(candidate);
      }
    }

    async function startCall() {
      try {
        const iceServers = await getIceServers().catch(() => [
          { urls: "stun:stun.l.google.com:19302" },
        ]);
        if (cancelled) return;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        const pc = new RTCPeerConnection({
          iceServers,
          iceCandidatePoolSize: 4,
        });
        pcRef.current = pc;
        setPcReady(true);

        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        pc.ontrack = (event) => {
          if (remoteVideoRef.current && event.streams[0]) {
            remoteVideoRef.current.srcObject = event.streams[0];
          }
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            onSignal({
              type: "candidate",
              candidate: event.candidate.toJSON(),
            });
          }
        };

        pc.onconnectionstatechange = () => {
          const state = pc.connectionState;
          setConnectionStatus(
            state === "connected"
              ? "Connected"
              : state === "failed"
                ? "Connection failed"
                : state === "disconnected"
                  ? "Disconnected"
                  : "Connecting..."
          );
        };

        pc.oniceconnectionstatechange = () => {
          const state = pc.iceConnectionState;
          if (state === "checking") {
            setConnectionStatus("Connecting...");
          }
          if (state === "connected" || state === "completed") {
            setConnectionStatus("Connected");
          }
          if (state === "failed") {
            setConnectionStatus("Connection failed. TURN server may be required.");
          }
        };

        setConnectionStatus("Waiting for stranger...");

        if (isInitiator) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          onSignal({ type: "offer", sdp: offer });
        }

        await flushCandidates();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Camera or microphone permission was blocked.";
        setMediaError(message);
        setConnectionStatus("Camera unavailable");
      }
    }

    void startCall();

    return () => {
      cancelled = true;
      pcRef.current?.close();
      pcRef.current = null;
      setPcReady(false);
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    };
  }, [isInitiator, onSignal]);

  useEffect(() => {
    async function handleSignal(signal: VideoSignal) {
      if (handledSignalsRef.current.has(signal.id)) return;

      const pc = pcRef.current;
      if (!pc) return;
      handledSignalsRef.current.add(signal.id);

      const type = String(signal.payload.type || "");

      if (type === "offer") {
        const sdp = signal.payload.sdp as RTCSessionDescriptionInit;
        await pc.setRemoteDescription(sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        onSignal({ type: "answer", sdp: answer });

        const candidates = pendingCandidatesRef.current.splice(0);
        for (const candidate of candidates) {
          await pc.addIceCandidate(candidate);
        }
      }

      if (type === "answer") {
        const sdp = signal.payload.sdp as RTCSessionDescriptionInit;
        if (!pc.currentRemoteDescription) {
          await pc.setRemoteDescription(sdp);
        }

        const candidates = pendingCandidatesRef.current.splice(0);
        for (const candidate of candidates) {
          await pc.addIceCandidate(candidate);
        }
      }

      if (type === "candidate") {
        const candidate = signal.payload.candidate as RTCIceCandidateInit;
        if (pc.remoteDescription) {
          await pc.addIceCandidate(candidate);
        } else {
          pendingCandidatesRef.current.push(candidate);
        }
      }
    }

    signals.forEach((signal) => {
      void handleSignal(signal);
    });
  }, [signals, onSignal, pcReady]);

  const toggleMic = () => {
    const enabled = !micOn;
    localStreamRef.current
      ?.getAudioTracks()
      .forEach((track) => {
        track.enabled = enabled;
      });
    setMicOn(enabled);
  };

  const toggleCamera = () => {
    const enabled = !cameraOn;
    localStreamRef.current
      ?.getVideoTracks()
      .forEach((track) => {
        track.enabled = enabled;
      });
    setCameraOn(enabled);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[1fr_220px]">
        <div className="relative aspect-video overflow-hidden rounded-xl border border-white/[0.08] bg-black">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="h-full w-full object-cover"
          />
          <div className="absolute left-3 top-3 rounded-md bg-black/50 px-2 py-1 text-xs font-medium text-white">
            Stranger
          </div>
          <div className="absolute bottom-3 left-3 rounded-md bg-black/50 px-2 py-1 text-xs text-gray-200">
            {connectionStatus}
          </div>
        </div>

        <div className="relative aspect-video overflow-hidden rounded-xl border border-white/[0.08] bg-black md:aspect-auto">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover"
          />
          <div className="absolute left-3 top-3 rounded-md bg-black/50 px-2 py-1 text-xs font-medium text-white">
            You
          </div>
        </div>
      </div>

      {mediaError && (
        <div className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          Allow camera and microphone access to start the video call. {mediaError}
        </div>
      )}

      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={toggleMic}
          className={`flex h-11 w-11 items-center justify-center rounded-full transition-all ${
            micOn
              ? "bg-white/[0.08] text-gray-200 hover:bg-white/[0.12]"
              : "bg-red-500 text-white hover:bg-red-400"
          }`}
          title={micOn ? "Mute microphone" : "Unmute microphone"}
        >
          {micOn ? <Mic size={18} /> : <MicOff size={18} />}
        </button>
        <button
          type="button"
          onClick={toggleCamera}
          className={`flex h-11 w-11 items-center justify-center rounded-full transition-all ${
            cameraOn
              ? "bg-white/[0.08] text-gray-200 hover:bg-white/[0.12]"
              : "bg-red-500 text-white hover:bg-red-400"
          }`}
          title={cameraOn ? "Turn camera off" : "Turn camera on"}
        >
          {cameraOn ? <Video size={18} /> : <VideoOff size={18} />}
        </button>
      </div>
    </div>
  );
}
