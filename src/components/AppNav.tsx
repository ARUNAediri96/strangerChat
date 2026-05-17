import { useEffect, useState, type MouseEvent } from "react";
import { Moon, Sun } from "lucide-react";
import { getActivityCount, type AppUser } from "../lib/match-api";

type AppTheme = "light" | "dark";

const FAKE_ACTIVITY_MIN = 5000;
const FAKE_ACTIVITY_MAX = 10000;

interface AppNavProps {
  theme: AppTheme;
  currentUser: AppUser | null;
  onNavigate: (page: string) => void;
  onThemeChange: (theme: AppTheme) => void;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, username: string, password: string) => Promise<string | null>;
  onLogout: () => void;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

export default function AppNav({
  theme,
  currentUser,
  onNavigate,
  onThemeChange,
  onLogin,
  onRegister,
  onLogout,
  onChangePassword,
}: AppNavProps) {
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [activityCount, setActivityCount] = useState(() => initialStoredActivityCount());

  useEffect(() => {
    let cancelled = false;

    async function loadActivityCount() {
      try {
        const nextCount = await getActivityCount();
        if (cancelled) return;
        setActivityCount(clampActivityCount(nextCount));
        localStorage.setItem("activity_count", String(clampActivityCount(nextCount)));
      } catch {
        if (cancelled) return;
        setActivityCount((current) => {
          const nextCount = nextFallbackActivityCount(current);
          localStorage.setItem("activity_count", String(nextCount));
          return nextCount;
        });
      }
    }

    void loadActivityCount();
    const intervalId = window.setInterval(() => {
      void loadActivityCount();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  function handleNavClick(event: MouseEvent<HTMLAnchorElement>, page: string) {
    event.preventDefault();
    onNavigate(page);
  }

  return (
    <>
      <header className="relative z-30 border-b border-white/10 bg-gray-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <a href="/" onClick={(event) => handleNavClick(event, "home")} className="text-xl font-bold text-white">
            Stranger<span className="text-emerald-400">Chat</span>
          </a>
          <nav className="flex flex-wrap items-center gap-2 text-sm text-gray-400 sm:gap-3">
            {["rooms", "friends", "blog", "about", "support"].map((item) => (
              <a
                key={item}
                href={`/${item}`}
                onClick={(event) => handleNavClick(event, item)}
                className="flex min-h-[40px] items-center px-1 capitalize hover:text-white"
              >
                {item}
              </a>
            ))}
            <a
              href="/"
              onClick={(event) => handleNavClick(event, "home")}
              className="flex min-h-[40px] items-center rounded-lg bg-emerald-500 px-3 font-semibold text-slate-950 hover:bg-emerald-300"
            >
              Start Chat
            </a>
            <div
              className="flex min-h-[40px] items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 text-xs font-semibold text-emerald-100"
              title="Displayed activity pulse"
            >
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </span>
              <span>{activityCount.toLocaleString()} active users</span>
            </div>
            <button
              type="button"
              onClick={() => onThemeChange(theme === "light" ? "dark" : "light")}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 font-semibold text-gray-200 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-300/60"
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
              title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
            >
              {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
              <span className="hidden sm:inline">{theme === "light" ? "Dark" : "Light"}</span>
            </button>
            {currentUser ? (
              <div className="relative">
                <button
                  onClick={() => setSettingsOpen((open) => !open)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-sm font-bold uppercase text-white ring-1 ring-emerald-300/30"
                  title="Account settings"
                >
                  {profileLabel(currentUser.username)}
                </button>
                {settingsOpen && (
                  <div className="absolute right-0 top-12 w-64 rounded-xl border border-white/10 bg-gray-950 p-3 shadow-2xl">
                    <div className="border-b border-white/10 pb-3">
                      <div className="text-sm font-semibold text-white">{currentUser.username}</div>
                      <div className="truncate text-xs text-gray-500">{currentUser.email}</div>
                    </div>
                    <button
                      onClick={() => {
                        setPasswordOpen(true);
                        setSettingsOpen(false);
                      }}
                      className="mt-3 w-full rounded-lg px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/10"
                    >
                      Change password
                    </button>
                    <button
                      onClick={onLogout}
                      className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-red-200 hover:bg-red-400/10"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <button onClick={() => setAuthMode("login")} className="rounded-lg border border-white/10 px-3 py-1.5 text-white hover:bg-white/10">
                  Login
                </button>
                <button onClick={() => setAuthMode("signup")} className="rounded-lg bg-emerald-500 px-3 py-1.5 font-semibold text-white hover:bg-emerald-400">
                  Signup
                </button>
              </>
            )}
          </nav>
        </div>
      </header>
      {authMode && (
        <AuthModal
          mode={authMode}
          onModeChange={setAuthMode}
          onClose={() => setAuthMode(null)}
          onLogin={onLogin}
          onRegister={onRegister}
        />
      )}
      {passwordOpen && (
        <PasswordModal
          onClose={() => setPasswordOpen(false)}
          onChangePassword={onChangePassword}
        />
      )}
    </>
  );
}

function initialStoredActivityCount() {
  const storedCount = Number(localStorage.getItem("activity_count"));
  if (Number.isFinite(storedCount) && storedCount > 0) return clampActivityCount(storedCount);
  return FAKE_ACTIVITY_MIN + Math.floor(Math.random() * (FAKE_ACTIVITY_MAX - FAKE_ACTIVITY_MIN + 1));
}

function clampActivityCount(value: number) {
  return Math.max(FAKE_ACTIVITY_MIN, Math.min(FAKE_ACTIVITY_MAX, value));
}

function nextFallbackActivityCount(current: number) {
  const direction = Math.random() > 0.49 ? 1 : -1;
  const step = 8 + Math.floor(Math.random() * 34);
  return clampActivityCount(current + direction * step);
}

function profileLabel(username: string) {
  const clean = username.trim();
  if (!clean) return "U";
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length > 1) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

function AuthModal({
  mode,
  onModeChange,
  onClose,
  onLogin,
  onRegister,
}: {
  mode: "login" | "signup";
  onModeChange: (mode: "login" | "signup") => void;
  onClose: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, username: string, password: string) => Promise<string | null>;
}) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function submit() {
    setMessage("");
    try {
      if (mode === "login") {
        await onLogin(email, password);
        onClose();
      } else {
        const verificationUrl = await onRegister(email, username, password);
        setMessage(
          verificationUrl
            ? `Dev verification link: ${verificationUrl}`
            : "Check your email to verify your account."
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-gray-950 p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">{mode === "login" ? "Login" : "Create account"}</h2>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-white">Close</button>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-white/[0.04] p-1">
          <button onClick={() => onModeChange("login")} className={`rounded-lg py-2 text-sm font-semibold ${mode === "login" ? "bg-emerald-500 text-white" : "text-gray-400"}`}>
            Login
          </button>
          <button onClick={() => onModeChange("signup")} className={`rounded-lg py-2 text-sm font-semibold ${mode === "signup" ? "bg-emerald-500 text-white" : "text-gray-400"}`}>
            Signup
          </button>
        </div>
        {mode === "signup" && (
          <input value={username} onChange={(event) => setUsername(event.target.value)} className="mb-3 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none" placeholder="Username" />
        )}
        <input value={email} onChange={(event) => setEmail(event.target.value)} className="mb-3 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none" placeholder="Email" />
        <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" className="mb-4 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none" placeholder="Password" />
        <button onClick={submit} className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-white hover:bg-emerald-400">
          {mode === "login" ? "Login" : "Signup"}
        </button>
        {message && <p className="mt-4 break-words text-sm leading-6 text-gray-300">{message}</p>}
      </div>
    </div>
  );
}

function PasswordModal({
  onClose,
  onChangePassword,
}: {
  onClose: () => void;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");

  async function submit() {
    setMessage("");
    try {
      await onChangePassword(currentPassword, newPassword);
      setMessage("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update password");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-gray-950 p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Change password</h2>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-white">Close</button>
        </div>
        <input
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          type="password"
          className="mb-3 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none"
          placeholder="Current password"
        />
        <input
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          type="password"
          className="mb-4 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none"
          placeholder="New password"
        />
        <button onClick={submit} className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-white hover:bg-emerald-400">
          Update password
        </button>
        {message && <p className="mt-4 text-sm leading-6 text-gray-300">{message}</p>}
      </div>
    </div>
  );
}
