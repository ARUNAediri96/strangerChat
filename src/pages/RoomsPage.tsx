import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Clock, Copy, Hash, Lock, MessageCircle, Plus, Send, Trash2, Users } from "lucide-react";
import {
  createChatChannel,
  createMeetingRoom,
  deleteMeetingRoom,
  joinMeetingRoom,
  listPublicRooms,
  type MeetingRoom,
} from "../lib/match-api";

interface RoomMessage {
  id: string;
  username: string;
  text: string;
  isMine: boolean;
}

interface RoomsPageProps {
  onNavigate: (page: string) => void;
}

export default function RoomsPage({ onNavigate }: RoomsPageProps) {
  const [rooms, setRooms] = useState<MeetingRoom[]>([]);
  const [username, setUsername] = useState(localStorage.getItem("room_username") || "");
  const [roomName, setRoomName] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [durationDays, setDurationDays] = useState(1);
  const [privateToken, setPrivateToken] = useState("");
  const [activeRoom, setActiveRoom] = useState<MeetingRoom | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState("");
  const [copiedToken, setCopiedToken] = useState(false);
  const sessionIdRef = useRef(stableRoomSessionId());
  const channelRef = useRef<ReturnType<typeof createChatChannel> | null>(null);

  useEffect(() => {
    void refreshRooms();
    return () => channelRef.current?.unsubscribe();
  }, []);

  async function refreshRooms() {
    const data = await listPublicRooms(sessionIdRef.current);
    setRooms(data.rooms);
  }

  async function enterRoom(room: MeetingRoom, options: { token?: string } = {}) {
    const cleanUsername = username.trim();
    if (!cleanUsername) {
      setNotice("Enter a username before joining a room.");
      return;
    }
    localStorage.setItem("room_username", cleanUsername);
    const joined = await joinMeetingRoom(cleanUsername, sessionIdRef.current, {
      roomId: options.token ? undefined : room.id,
      token: options.token,
    });
    channelRef.current?.unsubscribe();
    const channel = createChatChannel(joined.room.id, sessionIdRef.current);
    channelRef.current = channel;
    channel.on("broadcast", { event: "room-message" }, (event) => {
      const payload = event.payload;
      if (!payload?.text) return;
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          username: String(payload.username || "Guest"),
          text: String(payload.text),
          isMine: payload.session_id === sessionIdRef.current,
        },
      ]);
    });
    channel.subscribe();
    setMessages([]);
    setNotice("");
    setActiveRoom(joined.room);
    setCopiedToken(false);
  }

  async function copyPrivateToken(token: string) {
    try {
      await navigator.clipboard.writeText(token);
      setCopiedToken(true);
      window.setTimeout(() => setCopiedToken(false), 1800);
    } catch {
      setNotice("Could not copy the private token. Select it and copy manually.");
    }
  }

  async function handleCreateRoom() {
    if (!username.trim()) {
      setNotice("Enter a username before creating a room.");
      return;
    }
    if (!roomName.trim()) {
      setNotice("Room name is required.");
      return;
    }
    const data = await createMeetingRoom(
      roomName.trim(),
      visibility,
      username.trim(),
      sessionIdRef.current,
      durationDays
    );
    setRoomName("");
    await enterRoom(data.room);
    await refreshRooms();
  }

  async function handleJoinPrivate() {
    if (!privateToken.trim()) {
      setNotice("Paste the private room token first.");
      return;
    }
    await enterRoom(
      {
        id: "",
        name: "Private room",
        visibility: "private",
        ownerUsername: "",
        createdAt: "",
      },
      { token: privateToken.trim() }
    );
  }

  async function sendRoomMessage() {
    if (!input.trim() || !channelRef.current) return;
    await channelRef.current.send({
      type: "broadcast",
      event: "room-message",
      payload: {
        session_id: sessionIdRef.current,
        username: username.trim(),
        text: input.trim(),
      },
    });
    setInput("");
  }

  async function handleDeleteRoom() {
    if (!activeRoom) return;
    await deleteMeetingRoom(activeRoom.id, sessionIdRef.current);
    channelRef.current?.unsubscribe();
    setActiveRoom(null);
    setMessages([]);
    await refreshRooms();
  }

  async function deleteRoomFromList(room: MeetingRoom) {
    await deleteMeetingRoom(room.id, sessionIdRef.current);
    await refreshRooms();
  }

  if (activeRoom) {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        <header className="border-b border-white/10 bg-gray-950/90">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
            <div>
              <button onClick={() => onNavigate("home")} className="text-sm text-gray-400 hover:text-white">
                StrangerChat
              </button>
              <h1 className="mt-1 text-2xl font-bold">{activeRoom.name}</h1>
              {activeRoom.joinToken && (
                <div className="mt-2 flex max-w-full flex-wrap items-center gap-2">
                  <span className="break-all rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm font-semibold text-emerald-200">
                    Private token: {activeRoom.joinToken}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyPrivateToken(activeRoom.joinToken || "")}
                    className="inline-flex min-h-[36px] items-center gap-2 rounded-lg border border-white/10 px-3 text-sm font-semibold text-gray-200 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-300/60"
                    title="Copy private token"
                  >
                    {copiedToken ? <Check size={16} className="text-emerald-300" /> : <Copy size={16} />}
                    {copiedToken ? "Copied" : "Copy"}
                  </button>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  channelRef.current?.unsubscribe();
                  setActiveRoom(null);
                  setMessages([]);
                  void refreshRooms();
                }}
                className="flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-gray-300 hover:bg-white/10"
              >
                <ArrowLeft size={16} /> Back
              </button>
              {activeRoom.ownerSessionId === sessionIdRef.current && (
                <button
                  onClick={handleDeleteRoom}
                  className="flex items-center gap-2 rounded-lg border border-red-400/20 px-4 py-2 text-sm text-red-200 hover:bg-red-400/10"
                >
                  <Trash2 size={16} /> Delete
                </button>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto flex min-h-[calc(100vh-89px)] max-w-5xl flex-col px-4 py-6">
          <div className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.03] p-4">
            {messages.length === 0 && (
              <div className="py-16 text-center text-gray-500">Start the room conversation.</div>
            )}
            {messages.map((message) => (
              <div key={message.id} className={message.isMine ? "text-right" : "text-left"}>
                <div className="mb-1 text-xs text-gray-500">{message.username}</div>
                <span
                  className={`inline-block max-w-[80%] rounded-xl px-4 py-2 text-sm ${
                    message.isMine ? "bg-emerald-500 text-white" : "bg-white/10 text-gray-100"
                  }`}
                >
                  {message.text}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void sendRoomMessage();
              }}
              className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm outline-none focus:border-emerald-400/40"
              placeholder="Message this room..."
            />
            <button onClick={sendRoomMessage} className="rounded-xl bg-emerald-500 px-4 text-white">
              <Send size={18} />
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-6 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold">Online chat rooms</h1>
          <p className="mt-3 max-w-2xl text-gray-400">
            Create public rooms for anyone or private rooms with a token for friends. Every room requires a username,
            while anonymous random chat and video chat still stay separate.
          </p>
        </div>

        {notice && <div className="mb-4 rounded-xl border border-yellow-400/20 bg-yellow-400/10 p-3 text-yellow-100">{notice}</div>}

        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <section id="create-private-room" className="scroll-mt-24 space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm outline-none"
              placeholder="Username required"
            />
            <input
              value={roomName}
              onChange={(event) => setRoomName(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm outline-none"
              placeholder="Room name"
            />
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-1">
              <button onClick={() => setVisibility("public")} className={`rounded-lg py-2 text-sm ${visibility === "public" ? "bg-emerald-500" : "text-gray-400"}`}>
                Public
              </button>
              <button onClick={() => setVisibility("private")} className={`rounded-lg py-2 text-sm ${visibility === "private" ? "bg-emerald-500" : "text-gray-400"}`}>
                Private
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-1">
              {[1, 2, 3].map((days) => (
                <button
                  key={days}
                  onClick={() => setDurationDays(days)}
                  className={`flex items-center justify-center gap-1 rounded-lg py-2 text-sm ${
                    durationDays === days ? "bg-cyan-500 text-white" : "text-gray-400"
                  }`}
                >
                  <Clock size={14} /> {days}d
                </button>
              ))}
            </div>
            <button onClick={handleCreateRoom} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 font-semibold">
              <Plus size={18} /> Create room
            </button>
            <div className="border-t border-white/10 pt-4">
              <div className="mb-2 text-sm font-semibold text-gray-300">Join private room</div>
              <div className="flex gap-2">
                <input
                  value={privateToken}
                  onChange={(event) => setPrivateToken(event.target.value)}
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm outline-none"
                  placeholder="TOKEN"
                />
                <button onClick={handleJoinPrivate} className="rounded-xl bg-cyan-500 px-4 font-semibold">
                  Join
                </button>
              </div>
            </div>
          </section>

          <section id="available-rooms" className="scroll-mt-24 rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Available rooms</h2>
              <button onClick={refreshRooms} className="text-sm text-emerald-300">Refresh</button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {rooms.map((room) => (
                <div
                  key={room.id}
                  className="rounded-xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-emerald-400/30 hover:bg-white/[0.07]"
                >
                  <button onClick={() => enterRoom(room)} className="w-full text-left">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{room.name}</div>
                        <div className="mt-1 text-xs text-gray-500">Created by {room.ownerUsername}</div>
                      </div>
                      {room.visibility === "public" ? <Hash size={18} className="text-emerald-300" /> : <Lock size={18} className="text-cyan-300" />}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-gray-400">
                      <Users size={16} /> {room.memberCount || 0} joined
                      <MessageCircle size={16} className="ml-2" /> text chat
                      <Clock size={16} className="ml-2" /> {room.durationDays || 1}d
                    </div>
                  </button>
                  {room.ownerSessionId === sessionIdRef.current && (
                    <button
                      onClick={() => deleteRoomFromList(room)}
                      className="mt-4 flex items-center gap-2 rounded-lg border border-red-400/20 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-400/10"
                    >
                      <Trash2 size={14} /> Delete room
                    </button>
                  )}
                </div>
              ))}
              {rooms.length === 0 && <div className="text-gray-500">No rooms yet. Create the first one.</div>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function stableRoomSessionId() {
  const existing = localStorage.getItem("room_session_id");
  if (existing) return existing;
  const next = crypto.randomUUID();
  localStorage.setItem("room_session_id", next);
  return next;
}
