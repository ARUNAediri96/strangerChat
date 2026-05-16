import { useState } from "react";
import {
  BadgeCheck,
  CircleUser,
  DoorOpen,
  Eye,
  Flag,
  Lock,
  MessageCircle,
  MousePointerClick,
  RefreshCw,
  Shield,
  Shuffle,
  Sparkles,
  UserRound,
  Users,
  Video,
  X,
  Zap,
} from "lucide-react";
import FilterInput from "../components/FilterInput";
import SearchAnimation from "../components/SearchAnimation";
import type { ChatMode, ChatStatus, UserGender } from "../lib/use-chat";

interface HomePageProps {
  status: ChatStatus;
  matchedFilters: string[];
  onStartChat: (filters: string[], mode: ChatMode, gender: UserGender) => void;
  onCancelSearch: () => void;
  onNavigate: (page: string) => void;
}

const trustItems = [
  { icon: Lock, label: "End-to-end encrypted" },
  { icon: Eye, label: "No account needed" },
  { icon: Shield, label: "Skip and report anytime" },
];

const steps = [
  {
    icon: MousePointerClick,
    title: "Pick a mode",
    body: "Choose text chat or video, then add interests if you want a closer match.",
  },
  {
    icon: Shuffle,
    title: "Match instantly",
    body: "We connect you with a random stranger or someone who shares your topics.",
  },
  {
    icon: MessageCircle,
    title: "Chat safely",
    body: "Leave, skip, or report from the chat controls whenever the vibe is not right.",
  },
];

const features = [
  {
    icon: Zap,
    title: "Fast random chat",
    body: "Start a private conversation in seconds without forms or profiles.",
  },
  {
    icon: Sparkles,
    title: "Interest matching",
    body: "Use filters like music, gaming, coding, travel, or go fully random.",
  },
  {
    icon: Video,
    title: "Text or video",
    body: "Move between lightweight anonymous chat and face-to-face video calls.",
  },
  {
    icon: Users,
    title: "Rooms and friends",
    body: "Join public rooms, create private rooms, or register only when you want friends.",
  },
];

const safetyControls = [
  { icon: RefreshCw, label: "Skip", body: "Move to the next stranger with one tap." },
  { icon: Flag, label: "Report", body: "Flag abusive behavior and leave the chat." },
  { icon: X, label: "Leave", body: "End the session immediately." },
];

export default function HomePage({
  status,
  onStartChat,
  onCancelSearch,
  onNavigate,
}: HomePageProps) {
  const [filters, setFilters] = useState<string[]>([]);
  const [mode, setMode] = useState<ChatMode>("chat");
  const [gender, setGender] = useState<UserGender>("male");

  const isSearching = status === "searching" || status === "generating-keys";

  function startSelectedChat() {
    onStartChat(filters, mode, gender);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section id="random-chat" className="scroll-mt-24 border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.14),transparent_34%),linear-gradient(135deg,#020617_0%,#0f172a_52%,#111827_100%)]">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 pb-10 pt-8 md:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pb-14 lg:pt-12">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-sm font-medium text-emerald-100">
              <BadgeCheck size={16} aria-hidden="true" />
              Omegle alternative for anonymous chat
            </div>

            <h1 className="text-4xl font-bold leading-tight tracking-normal text-white sm:text-5xl lg:text-6xl">
              Chat anonymously, instantly.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
              Meet strangers by interest or go fully random. Start a private text or video chat without creating an
              account.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={startSelectedChat}
                aria-label={mode === "video" ? "Start anonymous video chat" : "Start anonymous text chat"}
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg bg-emerald-500 px-6 py-3 text-base font-bold text-slate-950 shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:ring-offset-2 focus:ring-offset-slate-950 active:scale-[0.98]"
              >
                <MessageCircle size={20} aria-hidden="true" />
                {mode === "video" ? "Start Video Chat" : "Start Chat Free"}
              </button>
              <button
                type="button"
                onClick={() => onNavigate("rooms")}
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-6 py-3 text-base font-semibold text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:ring-offset-2 focus:ring-offset-slate-950"
              >
                <DoorOpen size={20} aria-hidden="true" />
                Browse Rooms
              </button>
            </div>

            <div className="mt-6 grid gap-2 sm:grid-cols-3">
              {trustItems.map(({ icon: Icon, label }) => (
                <div key={label} className="flex min-h-[44px] items-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-slate-200">
                  <Icon size={17} className="text-cyan-300" aria-hidden="true" />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="w-full lg:justify-self-end">
            <ChatStarterPanel
              filters={filters}
              gender={gender}
              isSearching={isSearching}
              mode={mode}
              onCancelSearch={onCancelSearch}
              onFiltersChange={setFilters}
              onGenderChange={setGender}
              onModeChange={setMode}
              onStartChat={startSelectedChat}
              onNavigate={onNavigate}
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10 md:px-6 lg:py-14">
        <div className="grid gap-4 md:grid-cols-3">
          {steps.map(({ icon: Icon, title, body }, index) => (
            <article key={title} className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-400/12 text-cyan-200">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <span className="text-sm font-bold uppercase text-slate-500">Step {index + 1}</span>
              </div>
              <h2 className="text-xl font-semibold text-white">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="safety-controls" className="scroll-mt-24 border-y border-white/10 bg-slate-900/50">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-start lg:py-14">
          <div>
            <p className="text-sm font-bold uppercase text-emerald-300">Safety controls</p>
            <h2 className="mt-2 text-3xl font-bold tracking-normal text-white">Stay in control of every chat.</h2>
            <p className="mt-4 text-base leading-7 text-slate-400">
              Anonymous chat should never feel like a trap. StrangerChat keeps the most important controls visible so
              you can move on quickly.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {safetyControls.map(({ icon: Icon, label, body }) => (
              <article key={label} className="rounded-lg border border-white/10 bg-slate-950/70 p-5">
                <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-rose-400/12 text-rose-200">
                  <Icon size={21} aria-hidden="true" />
                </span>
                <h3 className="text-lg font-semibold text-white">{label}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="video-chat" className="scroll-mt-24 mx-auto max-w-6xl px-4 py-10 md:px-6 lg:py-14">
        <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-bold uppercase text-cyan-300">Anonymous chat features</p>
            <h2 className="mt-2 text-3xl font-bold tracking-normal text-white">Everything needed to start talking.</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-slate-400">
            Clear controls, readable layouts, and optional account features keep the first conversation fast while still
            supporting repeat chats.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, body }) => (
            <article key={title} className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
              <Icon size={22} className="text-amber-200" aria-hidden="true" />
              <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-white/10 bg-slate-900/60 pb-24 md:pb-12">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 md:px-6 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <p className="text-sm font-bold uppercase text-emerald-300">Online chat rooms</p>
            <h2 className="mt-2 text-3xl font-bold tracking-normal text-white">Public rooms or private token rooms.</h2>
            <p className="mt-4 text-base leading-7 text-slate-400">
              Join a public room for topic-based conversations, or create a private room and share its token with people
              you trust.
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-slate-950/80 p-5">
            <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <p className="text-sm font-semibold text-white">Create or join a room</p>
                <p className="text-xs text-slate-500">Username only. Account optional.</p>
              </div>
              <DoorOpen size={22} className="text-emerald-300" aria-hidden="true" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-white/[0.05] p-4">
                <p className="text-sm font-semibold text-white">Public lounge</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">Open topic rooms for quick group chat.</p>
              </div>
              <div className="rounded-lg bg-white/[0.05] p-4">
                <p className="text-sm font-semibold text-white">Private token</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">Invite-only rooms for known people.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("rooms")}
              className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-100 focus:ring-offset-2 focus:ring-offset-slate-950"
            >
              <DoorOpen size={18} aria-hidden="true" />
              Open Chat Rooms
            </button>
          </div>
        </div>
      </section>

      {!isSearching && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-slate-950/95 p-3 shadow-2xl backdrop-blur md:hidden">
          <button
            type="button"
            onClick={startSelectedChat}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-3 text-base font-bold text-slate-950"
          >
            <MessageCircle size={19} aria-hidden="true" />
            {mode === "video" ? "Start Video Chat" : "Start Random Chat"}
          </button>
        </div>
      )}
    </main>
  );
}

function ChatStarterPanel({
  filters,
  gender,
  isSearching,
  mode,
  onCancelSearch,
  onFiltersChange,
  onGenderChange,
  onModeChange,
  onNavigate,
  onStartChat,
}: {
  filters: string[];
  gender: UserGender;
  isSearching: boolean;
  mode: ChatMode;
  onCancelSearch: () => void;
  onFiltersChange: (filters: string[]) => void;
  onGenderChange: (gender: UserGender) => void;
  onModeChange: (mode: ChatMode) => void;
  onNavigate: (page: string) => void;
  onStartChat: () => void;
}) {
  if (isSearching) {
    return (
      <div className="rounded-lg border border-white/10 bg-slate-950/85 p-5 shadow-2xl shadow-black/30 backdrop-blur">
        <SearchAnimation />
        {filters.length > 0 && (
          <div className="mb-4 mt-2 flex flex-wrap justify-center gap-1.5">
            {filters.map((filter) => (
              <span key={filter} className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">
                {filter}
              </span>
            ))}
          </div>
        )}
        <p className="mb-5 text-center text-sm text-slate-400">Finding a chat partner. Your messages will be end-to-end encrypted.</p>
        <button
          type="button"
          onClick={onCancelSearch}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] py-3 font-semibold text-slate-200 transition hover:bg-white/[0.1]"
        >
          <X size={18} aria-hidden="true" />
          Stop Searching
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/85 p-5 shadow-2xl shadow-black/30 backdrop-blur">
      <div className="mb-5">
        <p className="text-sm font-bold uppercase text-emerald-300">Start now</p>
        <h2 className="mt-1 text-2xl font-bold text-white">
          {mode === "video" ? "Meet face to face anonymously" : "Talk anonymously with strangers"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">Use filters for shared interests, or leave them empty for a random match.</p>
      </div>

      <fieldset className="mb-5">
        <legend className="mb-2 text-sm font-medium text-slate-300">Select your gender</legend>
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-white/[0.04] p-1">
          <ToggleButton active={gender === "male"} icon={UserRound} label="Male" onClick={() => onGenderChange("male")} tone="cyan" />
          <ToggleButton active={gender === "female"} icon={CircleUser} label="Female" onClick={() => onGenderChange("female")} tone="rose" />
        </div>
      </fieldset>

      <fieldset className="mb-5">
        <legend className="sr-only">Chat mode</legend>
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-white/[0.04] p-1">
          <ToggleButton active={mode === "chat"} icon={MessageCircle} label="Text chat" onClick={() => onModeChange("chat")} tone="emerald" />
          <ToggleButton active={mode === "video"} icon={Video} label="Video call" onClick={() => onModeChange("video")} tone="emerald" />
        </div>
      </fieldset>

      <div className="mb-5">
        <label className="mb-2 block text-sm font-medium text-slate-300">Interest filters</label>
        <FilterInput filters={filters} onFiltersChange={onFiltersChange} />
      </div>

      <button
        type="button"
        onClick={onStartChat}
        className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 py-3.5 text-base font-bold text-slate-950 transition hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:ring-offset-2 focus:ring-offset-slate-950 active:scale-[0.98]"
      >
        <MessageCircle size={20} aria-hidden="true" />
        {mode === "video" ? "Start Video Chat" : "Start Chat Free"}
      </button>
      <button
        type="button"
        onClick={() => onNavigate("rooms")}
        className="mt-3 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]"
      >
        <DoorOpen size={17} aria-hidden="true" />
        Public and Private Rooms
      </button>
    </div>
  );
}

function ToggleButton({
  active,
  icon: Icon,
  label,
  onClick,
  tone,
}: {
  active: boolean;
  icon: typeof MessageCircle;
  label: string;
  onClick: () => void;
  tone: "cyan" | "emerald" | "rose";
}) {
  const activeClass = {
    cyan: "bg-cyan-400 text-slate-950",
    emerald: "bg-emerald-500 text-slate-950",
    rose: "bg-rose-400 text-slate-950",
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-[44px] items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-bold transition ${
        active ? activeClass : "text-slate-400 hover:bg-white/[0.06] hover:text-white"
      }`}
    >
      <Icon size={17} aria-hidden="true" />
      {label}
    </button>
  );
}
