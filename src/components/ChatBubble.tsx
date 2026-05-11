import type { ChatMessage } from "../lib/use-chat";

interface ChatBubbleProps {
  message: ChatMessage;
}

export default function ChatBubble({ message }: ChatBubbleProps) {
  const isMine = message.isMine;

  return (
    <div
      className={`flex ${isMine ? "justify-end" : "justify-start"} animate-[slideIn_0.25s_ease-out]`}
    >
      <div
        className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
          isMine
            ? "bg-emerald-500/90 text-white rounded-br-md"
            : "bg-white/10 text-gray-200 rounded-bl-md border border-white/5"
        }`}
      >
        {message.text}
      </div>
    </div>
  );
}
