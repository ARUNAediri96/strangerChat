import { LifeBuoy, MessageCircle, Search, Shield, Users, Video } from "lucide-react";
import type { ReactNode } from "react";

interface ContentPageProps {
  page: "blog" | "about" | "support";
}

const pageCopy = {
  blog: {
    title: "Blog",
    intro:
      "Guides for safer random chat, anonymous chat etiquette, video chat with strangers, and building better online chat rooms.",
    icon: Search,
    sections: [
      {
        title: "A modern alternative for Omegle",
        text:
          "StrangerChat keeps the instant feeling people loved from Omegle while adding interest filters, public rooms, private rooms, and safer reporting tools. You can jump into random chat without registration or create an account only when you want friend features.",
      },
      {
        title: "How to chat with strangers safely",
        text:
          "Use a nickname, avoid sharing personal details too early, and leave any conversation that feels uncomfortable. Anonymous chat works best when people keep boundaries clear and treat every stranger like a real person.",
      },
      {
        title: "When to use rooms instead of random matching",
        text:
          "Online chat rooms are better for group conversations, events, classes, and friend circles. Public rooms help people discover conversations, while private rooms keep the discussion limited to people with the token.",
      },
    ],
  },
  about: {
    title: "About StrangerChat",
    intro:
      "StrangerChat is built for fast random chat, anonymous text chat, video chat with strangers, and flexible online chat rooms.",
    icon: Users,
    sections: [
      {
        title: "Anonymous by default",
        text:
          "Random chat and video chat work without signup. Registration is only needed for friend requests and known-friend messaging, so casual visitors can still chat freely.",
      },
      {
        title: "Public and private spaces",
        text:
          "Users can create public meeting rooms that anyone can join or private rooms protected by a shareable token. This makes the platform useful for both spontaneous stranger chat and planned conversations.",
      },
      {
        title: "Designed for real conversations",
        text:
          "The product combines filters, ephemeral events, room usernames, reporting, and friend requests so people can move from anonymous chat to trusted connections when both sides choose it.",
      },
    ],
  },
  support: {
    title: "Support",
    intro:
      "Get help with random chat, anonymous chat, private room tokens, accounts, email verification, and friend requests.",
    icon: LifeBuoy,
    sections: [
      {
        title: "Account and verification",
        text:
          "Create an account with email and password to use friend requests. If verification email delivery is not configured, development builds show a verification link after signup.",
      },
      {
        title: "Private room access",
        text:
          "Private rooms require the exact token generated when the room is created. Share it through WhatsApp or another private channel, then enter a username before joining.",
      },
      {
        title: "Safety and reporting",
        text:
          "Use the report button during random chats if someone violates the rules. You can skip, leave, or close a room at any time.",
      },
    ],
  },
};

export default function ContentPage({ page }: ContentPageProps) {
  const copy = pageCopy[page];
  const Icon = copy.icon;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <main className="mx-auto max-w-6xl px-4 py-12">
        <div className="max-w-3xl">
          <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10">
            <Icon className="text-emerald-300" size={24} />
          </div>
          <h1 className="text-5xl font-bold tracking-tight">{copy.title}</h1>
          <p className="mt-5 text-lg leading-8 text-gray-300">{copy.intro}</p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {copy.sections.map((section) => (
            <article key={section.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
              <h2 className="text-xl font-semibold">{section.title}</h2>
              <p className="mt-4 leading-7 text-gray-400">{section.text}</p>
            </article>
          ))}
        </div>

        <section className="mt-12 rounded-xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="text-2xl font-semibold">Platform features</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <Feature icon={<MessageCircle size={18} />} title="Random chat" text="Start instant anonymous chat with strangers." />
            <Feature icon={<Video size={18} />} title="Video chat" text="Use peer-to-peer video chat with strangers." />
            <Feature icon={<Shield size={18} />} title="Private rooms" text="Share a token so only invited people can join." />
          </div>
        </section>
      </main>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-lg bg-white/[0.04] p-4">
      <div className="mb-3 text-emerald-300">{icon}</div>
      <div className="font-semibold">{title}</div>
      <div className="mt-1 text-sm text-gray-400">{text}</div>
    </div>
  );
}
