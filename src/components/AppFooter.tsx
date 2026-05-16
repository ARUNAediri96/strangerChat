import { Facebook, Instagram, Linkedin, Mail, MessageCircle, Shield, Sparkles } from "lucide-react";
import type { MouseEvent } from "react";

interface AppFooterProps {
  onNavigate: (page: string) => void;
}

const footerGroups = [
  {
    title: "Chat",
    links: [
      { label: "Random chat", target: "home#random-chat", href: "/#random-chat" },
      { label: "Online rooms", target: "rooms#available-rooms", href: "/rooms#available-rooms" },
      { label: "Friends chat", target: "friends#friends-chat", href: "/friends#friends-chat" },
      { label: "Video chat", target: "home#video-chat", href: "/#video-chat" },
    ],
  },
  {
    title: "Safety",
    links: [
      { label: "Safety tips", target: "blog#safety-tips", href: "/blog#safety-tips" },
      { label: "Private rooms", target: "rooms#create-private-room", href: "/rooms#create-private-room" },
      { label: "Report abuse", target: "support#report-abuse", href: "/support#report-abuse" },
      { label: "Support center", target: "support#help", href: "/support#help" },
    ],
  },
  {
    title: "StrangerChat",
    links: [
      { label: "About", target: "about#about-strangerchat", href: "/about#about-strangerchat" },
      { label: "Blog", target: "blog#blog-guides", href: "/blog#blog-guides" },
      { label: "Contact", target: "support#contact", href: "/support#contact" },
      { label: "Create account", target: "friends#create-account", href: "/friends#create-account" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms", target: "support#terms", href: "/support#terms" },
      { label: "Privacy", target: "support#privacy", href: "/support#privacy" },
      { label: "Community rules", target: "blog#community-rules", href: "/blog#community-rules" },
      { label: "Help", target: "support#help", href: "/support#help" },
    ],
  },
];

const socialLinks = [
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/",
    icon: Linkedin,
  },
  {
    label: "Facebook",
    href: "https://www.facebook.com/",
    icon: Facebook,
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/",
    icon: Instagram,
  },
];

export default function AppFooter({ onNavigate }: AppFooterProps) {
  function handleLinkClick(event: MouseEvent<HTMLAnchorElement>, target: string) {
    event.preventDefault();
    onNavigate(target);
  }

  return (
    <footer className="bg-slate-950 text-white">
      <div className="border-y border-white/10 bg-[radial-gradient(circle_at_18%_50%,rgba(16,185,129,0.18),transparent_28%),radial-gradient(circle_at_78%_50%,rgba(34,211,238,0.14),transparent_30%),linear-gradient(135deg,#020617_0%,#0f172a_55%,#052e2b_100%)]">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-8 sm:grid-cols-3">
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
            <div className="text-sm font-bold text-emerald-300">Anonymous first</div>
            <p className="mt-2 text-sm leading-6 text-slate-400">Start random text or video chat without signup.</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
            <div className="text-sm font-bold text-cyan-300">Private rooms</div>
            <p className="mt-2 text-sm leading-6 text-slate-400">Share a token only with the people you invite.</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
            <div className="text-sm font-bold text-sky-300">Safety controls</div>
            <p className="mt-2 text-sm leading-6 text-slate-400">Skip, leave, or report whenever a chat feels wrong.</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-14">
        <div className="flex flex-col gap-6 border-b border-white/10 pb-10 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <a
              href="/"
              onClick={(event) => handleLinkClick(event, "home")}
              className="text-4xl font-bold tracking-normal text-white"
            >
              Stranger<span className="text-emerald-400">Chat</span>
            </a>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">
              Anonymous random chat, private rooms, friend requests, and safety controls for quick conversations.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href="/support"
              onClick={(event) => handleLinkClick(event, "support")}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-white/20 px-4 text-sm font-semibold text-white hover:bg-white/10"
            >
              <Mail size={17} /> Contact us
            </a>
            <a
              href="/"
              onClick={(event) => handleLinkClick(event, "home")}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-emerald-500 px-4 text-sm font-bold text-slate-950 hover:bg-emerald-300"
            >
              <MessageCircle size={17} /> Start chat
            </a>
          </div>
        </div>

        <div className="grid gap-10 py-10 sm:grid-cols-2 lg:grid-cols-4">
          {footerGroups.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <h2 className="text-sm font-bold uppercase tracking-normal text-slate-100">{group.title}</h2>
              <div className="mt-5 grid gap-4">
                {group.links.map((link) => (
                  <a
                    key={`${group.title}-${link.label}`}
                    href={link.href}
                    onClick={(event) => handleLinkClick(event, link.target)}
                    className="text-sm text-slate-400 transition hover:text-emerald-300"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </nav>
          ))}
        </div>

        <div className="grid h-2 grid-cols-6 overflow-hidden rounded-full">
          <span className="bg-emerald-400" />
          <span className="bg-cyan-400" />
          <span className="bg-blue-500" />
          <span className="bg-emerald-500" />
          <span className="bg-sky-500" />
          <span className="bg-cyan-300" />
        </div>

        <div className="flex flex-col gap-5 pt-10 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <span>&copy; 2026 StrangerChat</span>
            <span className="inline-flex items-center gap-2">
              <Shield size={16} className="text-emerald-300" /> Built for safer anonymous chat
            </span>
            <span className="inline-flex items-center gap-2">
              <Sparkles size={16} className="text-cyan-300" /> No signup needed
            </span>
          </div>
          <div className="flex items-center gap-3">
            {socialLinks.map(({ label, href, icon: Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-slate-300 transition hover:border-emerald-300/40 hover:bg-white/[0.06] hover:text-white"
                title={label}
                aria-label={label}
              >
                <Icon size={20} />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
