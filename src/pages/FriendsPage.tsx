import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Send, UserPlus, Users, X } from "lucide-react";
import {
  createChatChannel,
  listFriendRequests,
  listFriends,
  openFriendChat,
  respondFriendRequest,
  type AppUser,
  type FriendRequestPayload,
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
  const [requests, setRequests] = useState<FriendRequestPayload[]>([]);
  const [activeFriend, setActiveFriend] = useState<AppUser | null>(null);
  const [messages, setMessages] = useState<FriendMessage[]>([]);
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState("");
  const sessionIdRef = useRef(crypto.randomUUID());
  const channelRef = useRef<ReturnType<typeof createChatChannel> | null>(null);
  const seenMessageIdsRef = useRef(new Set<string>());

  const loadFriendData = useCallback(async () => {
    const [friendsData, requestsData] = await Promise.all([
      listFriends(authToken),
      listFriendRequests(authToken),
    ]);
    setFriends(friendsData.friends);
    setRequests(requestsData.requests);
  }, [authToken]);

  useEffect(() => {
    if (!authToken) return;
    void loadFriendData()
      .catch((error) => setNotice(error instanceof Error ? error.message : "Login required"));
    return () => channelRef.current?.unsubscribe();
  }, [authToken, loadFriendData]);

  async function respondToRequest(requestId: string, action: "accept" | "reject") {
    setNotice("");
    try {
      await respondFriendRequest(requestId, action, authToken);
      setRequests((prev) => prev.filter((request) => request.id !== requestId));
      if (action === "accept") {
        await loadFriendData();
        setNotice("Friend request accepted.");
      } else {
        setNotice("Friend request declined.");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update request");
    }
  }

  async function selectFriend(friend: AppUser) {
    if (!currentUser) return;
    const data = await openFriendChat(friend.id, authToken);
    channelRef.current?.unsubscribe();
    seenMessageIdsRef.current.clear();
    const channel = createChatChannel(data.chatId, sessionIdRef.current);
    channelRef.current = channel;
    channel.on("broadcast", { event: "friend-message" }, (event) => {
      const payload = event.payload;
      if (!payload?.text) return;
      const messageId = String(payload.message_id || payload.__event_id || crypto.randomUUID());
      if (seenMessageIdsRef.current.has(messageId)) return;
      seenMessageIdsRef.current.add(messageId);
      setMessages((prev) => [
        ...prev,
        {
          id: messageId,
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
        message_id: crypto.randomUUID(),
        username: currentUser.username,
        text: input.trim(),
      },
    });
    setInput("");
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <main id="friends-chat" className="scroll-mt-24 mx-auto grid max-w-6xl gap-5 px-4 py-8 lg:grid-cols-[300px_1fr]">
        <section id="create-account" className="scroll-mt-24 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-5 lg:col-span-2">
          <h1 className="text-3xl font-bold">Friends chat and accounts</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-300">
            Create a verified account when you want to accept friend requests after anonymous chats and continue
            conversations with people you already trust. Random chat still works without signup.
          </p>
        </section>
        <aside className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Users size={20} /> Friends
          </div>
          {!currentUser && <div className="text-sm text-gray-400">Login to use friend chat.</div>}
          {notice && <div className="mb-3 rounded-lg bg-yellow-400/10 p-3 text-sm text-yellow-100">{notice}</div>}
          {currentUser && (
            <div className="mb-5 border-b border-white/10 pb-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-200">
                <UserPlus size={16} /> Requests
              </div>
              <div className="space-y-2">
                {requests.map((request) => (
                  <div key={request.id} className="rounded-lg bg-white/[0.04] p-3">
                    <div className="text-sm font-medium text-white">{request.sender.username}</div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => respondToRequest(request.id, "accept")}
                        className="flex h-9 flex-1 items-center justify-center rounded-lg bg-emerald-500 text-white hover:bg-emerald-400"
                        title="Accept request"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => respondToRequest(request.id, "reject")}
                        className="flex h-9 flex-1 items-center justify-center rounded-lg bg-white/10 text-gray-200 hover:bg-white/15"
                        title="Decline request"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))}
                {requests.length === 0 && (
                  <div className="text-sm text-gray-500">No pending requests.</div>
                )}
              </div>
            </div>
          )}
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
