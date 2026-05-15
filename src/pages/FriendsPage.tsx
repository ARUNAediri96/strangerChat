import { useEffect, useRef, useState } from "react";
import { Send, Users } from "lucide-react";
import {
  createChatChannel,
  listFriends,
  openFriendChat,
  type AppUser,
} from "../lib/match-api";

interface FriendsPageProps {
  authToken: string;
  currentUser: AppUser | null;
}

interface FriendMessage {
  id: string;
  text: string;
  username: string;
  isMine: boolean;
}

export default function FriendsPage({ authToken, currentUser }: FriendsPageProps) {
  const [friends, setFriends] = useState<AppUser[]>([]);
  const [activeFriend, setActiveFriend] = useState<AppUser | null>(null);
  const [messages, setMessages] = useState<FriendMessage[]>([]);
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState("");
  const sessionIdRef = useRef(crypto.randomUUID());
  const channelRef = useRef<ReturnType<typeof createChatChannel> | null>(null);

  useEffect(() => {
    if (!authToken) return;
    void listFriends(authToken)
      .then((data) => setFriends(data.friends))
      .catch((error) => setNotice(error instanceof Error ? error.message : "Login required"));
    return () => channelRef.current?.unsubscribe();
  }, [authToken]);

  async function selectFriend(friend: AppUser) {
    if (!currentUser) return;
    const data = await openFriendChat(friend.id, authToken);
    channelRef.current?.unsubscribe();
    const channel = createChatChannel(data.chatId, sessionIdRef.current);
    channelRef.current = channel;
    channel.on("broadcast", { event: "friend-message" }, (event) => {
      const payload = event.payload;
      if (!payload?.text) return;
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          text: String(payload.text),
          username: String(payload.username || "Friend"),
          isMine: payload.session_id === sessionIdRef.current,
        },
      ]);
    });
    channel.subscribe();
    setMessages([]);
    setActiveFriend(friend);
  }

  async function sendMessage() {
    if (!input.trim() || !channelRef.current || !currentUser) return;
    await channelRef.current.send({
      type: "broadcast",
      event: "friend-message",
      payload: {
        session_id: sessionIdRef.current,
        username: currentUser.username,
        text: input.trim(),
      },
    });
    setInput("");
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <main className="mx-auto grid max-w-6xl gap-5 px-4 py-8 lg:grid-cols-[300px_1fr]">
        <aside className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Users size={20} /> Friends
          </div>
          {!currentUser && <div className="text-sm text-gray-400">Login to use friend chat.</div>}
          {notice && <div className="mb-3 rounded-lg bg-yellow-400/10 p-3 text-sm text-yellow-100">{notice}</div>}
          <div className="space-y-2">
            {friends.map((friend) => (
              <button
                key={friend.id}
                onClick={() => selectFriend(friend)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                  activeFriend?.id === friend.id ? "bg-emerald-500 text-white" : "bg-white/[0.04] text-gray-300"
                }`}
              >
                {friend.username}
              </button>
            ))}
            {currentUser && friends.length === 0 && (
              <div className="text-sm text-gray-500">Accepted friends will appear here.</div>
            )}
          </div>
        </aside>

        <section className="flex min-h-[70vh] flex-col rounded-xl border border-white/10 bg-white/[0.03]">
          <div className="border-b border-white/10 p-4 font-semibold">
            {activeFriend ? `Chat with ${activeFriend.username}` : "Select a friend"}
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((message) => (
              <div key={message.id} className={message.isMine ? "text-right" : "text-left"}>
                <div className="mb-1 text-xs text-gray-500">{message.username}</div>
                <span className={`inline-block max-w-[80%] rounded-xl px-4 py-2 text-sm ${message.isMine ? "bg-emerald-500" : "bg-white/10"}`}>
                  {message.text}
                </span>
              </div>
            ))}
          </div>
          <div className="flex gap-2 border-t border-white/10 p-3">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void sendMessage();
              }}
              disabled={!activeFriend}
              className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm outline-none disabled:opacity-50"
              placeholder="Message your friend..."
            />
            <button onClick={sendMessage} disabled={!activeFriend} className="rounded-xl bg-emerald-500 px-4 disabled:opacity-50">
              <Send size={18} />
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
