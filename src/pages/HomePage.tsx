import { useState } from "react";
import { CircleUser, MessageCircle, Shield, UserRound, Video, Zap, Eye, X } from "lucide-react";
import FilterInput from "../components/FilterInput";
import SearchAnimation from "../components/SearchAnimation";
import type { ChatMode, ChatStatus, UserGender } from "../lib/use-chat";

interface HomePageProps {
  status: ChatStatus;
  matchedFilters: string[];
  onStartChat: (filters: string[], mode: ChatMode, gender: UserGender) => void;
  onCancelSearch: () => void;
}

export default function HomePage({
  status,
  onStartChat,
  onCancelSearch,
}: HomePageProps) {
  const [filters, setFilters] = useState<string[]>([]);
  const [mode, setMode] = useState<ChatMode>("chat");
  const [gender, setGender] = useState<UserGender>("male");

  const isSearching = status === "searching" || status === "generating-keys";

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-emerald-500/5 rounded-full blur-[120px] animate-[float_20s_ease-in-out_infinite]" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-teal-500/5 rounded-full blur-[120px] animate-[float_25s_ease-in-out_infinite_reverse]" />
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-cyan-500/3 rounded-full blur-[100px] animate-[float_15s_ease-in-out_infinite_2s]" />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative z-10 w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/20 mb-5 backdrop-blur-sm">
            <Shield size={32} className="text-emerald-400" />
          </div>
          <h1 className="text-4xl font-bold text-white tracking-tight">
            Stranger<span className="text-emerald-400">Chat</span>
          </h1>
          <p className="text-gray-500 mt-3 text-base">
            Anonymous. Encrypted. Ephemeral.
          </p>
        </div>

        {/* Main card */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 backdrop-blur-xl shadow-2xl">
          {isSearching ? (
            <>
              <SearchAnimation />
              {filters.length > 0 && (
                <div className="flex flex-wrap gap-1.5 justify-center mt-2 mb-4">
                  {filters.map((f) => (
                    <span
                      key={f}
                      className="px-2 py-0.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-center text-gray-500 text-sm mb-5">
                Your messages will be end-to-end encrypted
              </p>
              <button
                onClick={onCancelSearch}
                className="w-full py-3 bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.1] text-gray-300 font-semibold rounded-xl transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <X size={18} />
                Stop Searching
              </button>
            </>
          ) : (
            <>
              <div className="mb-5">
                <h2 className="text-white text-lg font-semibold mb-1">
                  {mode === "video" ? "Meet face to face anonymously" : "Talk anonymously with strangers"}
                </h2>
                <p className="text-gray-500 text-sm">
                  Add filters to find like-minded people, or go random.
                </p>
              </div>

              <div className="mb-5">
                <label className="mb-2 block text-sm font-medium text-gray-400">
                  Select your gender
                </label>
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/[0.04] border border-white/[0.08] p-1">
                  <button
                    type="button"
                    onClick={() => setGender("male")}
                    className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all ${
                      gender === "male"
                        ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/20"
                        : "text-gray-400 hover:text-white hover:bg-white/[0.06]"
                    }`}
                  >
                    <UserRound size={17} />
                    Male
                  </button>
                  <button
                    type="button"
                    onClick={() => setGender("female")}
                    className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all ${
                      gender === "female"
                        ? "bg-rose-500 text-white shadow-lg shadow-rose-500/20"
                        : "text-gray-400 hover:text-white hover:bg-white/[0.06]"
                    }`}
                  >
                    <CircleUser size={17} />
                    Female
                  </button>
                </div>
              </div>

              <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-white/[0.04] border border-white/[0.08] p-1">
                <button
                  type="button"
                  onClick={() => setMode("chat")}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all ${
                    mode === "chat"
                      ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                      : "text-gray-400 hover:text-white hover:bg-white/[0.06]"
                  }`}
                >
                  <MessageCircle size={17} />
                  Chat
                </button>
                <button
                  type="button"
                  onClick={() => setMode("video")}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all ${
                    mode === "video"
                      ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                      : "text-gray-400 hover:text-white hover:bg-white/[0.06]"
                  }`}
                >
                  <Video size={17} />
                  Video call
                </button>
              </div>

              <div className="mb-5">
                <FilterInput
                  filters={filters}
                  onFiltersChange={setFilters}
                />
              </div>

              <button
                onClick={() => onStartChat(filters, mode, gender)}
                className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 active:scale-[0.98]"
              >
                {mode === "video" ? "Start Video Call" : "Start Chat"}
              </button>
            </>
          )}
        </div>

        {/* Feature badges */}
        <div className="grid grid-cols-3 gap-3 mt-6">
          <div className="flex flex-col items-center gap-2 p-3 bg-white/[0.02] border border-white/[0.04] rounded-xl">
            <LockIcon />
            <span className="text-xs text-gray-500">E2E Encrypted</span>
          </div>
          <div className="flex flex-col items-center gap-2 p-3 bg-white/[0.02] border border-white/[0.04] rounded-xl">
            <Eye size={16} className="text-teal-400" />
            <span className="text-xs text-gray-500">Anonymous</span>
          </div>
          <div className="flex flex-col items-center gap-2 p-3 bg-white/[0.02] border border-white/[0.04] rounded-xl">
            <Zap size={16} className="text-cyan-400" />
            <span className="text-xs text-gray-500">Ephemeral</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LockIcon() {
  return <Shield size={16} className="text-emerald-400" />;
}
