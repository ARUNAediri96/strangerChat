export default function TypingIndicator() {
  return (
    <div className="flex justify-start animate-[slideIn_0.25s_ease-out]">
      <div className="px-4 py-3 bg-white/10 rounded-2xl rounded-bl-md border border-white/5">
        <div className="flex gap-1.5 items-center">
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-[bounce_1.4s_ease-in-out_infinite]" />
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-[bounce_1.4s_ease-in-out_0.2s_infinite]" />
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-[bounce_1.4s_ease-in-out_0.4s_infinite]" />
        </div>
      </div>
    </div>
  );
}
