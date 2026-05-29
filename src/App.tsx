import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useChat } from "./lib/use-chat";
import HomePage from "./pages/HomePage";
import ChatPage from "./pages/ChatPage";
import RoomsPage from "./pages/RoomsPage";
import ContentPage from "./pages/ContentPage";
import FriendsPage from "./pages/FriendsPage";
import AppNav from "./components/AppNav";
import AppFooter from "./components/AppFooter";
import {
  changeAccountPassword,
  getCurrentUser,
  loginAccount,
  registerAccount,
  verifyAccountEmail,
  type AppUser,
} from "./lib/match-api";

type AppTheme = "light" | "dark";

function initialTheme(): AppTheme {
  const savedTheme = localStorage.getItem("app_theme");
  return savedTheme === "light" ? "light" : "dark";
}

function pageFromHash() {
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (hash.startsWith("verify=")) return "home";
  return ["rooms", "friends", "blog", "about", "support"].includes(hash) ? hash : "home";
}

function pageFromLocation() {
  const pathPage = window.location.pathname.replace(/^\/+|\/+$/g, "");
  if (pathPage && ["rooms", "friends", "blog", "about", "support"].includes(pathPage)) {
    return pathPage;
  }
  return pageFromHash();
}

function verificationTokenFromLocation() {
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (hash.startsWith("verify=")) return decodeURIComponent(hash.slice("verify=".length));

  const hashParams = new URLSearchParams(hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : hash);
  const searchParams = new URLSearchParams(window.location.search);
  return hashParams.get("verify") || hashParams.get("token") || searchParams.get("verify") || searchParams.get("token");
}

const routeMetadata: Record<string, { title: string; description: string; canonical: string }> = {
  home: {
    title: "StrangerChat: Omegle Alternative & Anonymous Chat",
    description:
      "StrangerChat is a safe Omegle alternative for anonymous chat with strangers. Start free random text or video chat with no signup, interest filters, and chat rooms.",
    canonical: "https://chatstranger.online/",
  },
  rooms: {
    title: "Online Chat Rooms | StrangerChat",
    description:
      "Create or join public online chat rooms and private token rooms on StrangerChat. Chat with people by room, username, and topic.",
    canonical: "https://chatstranger.online/rooms",
  },
  friends: {
    title: "Friends Chat | StrangerChat",
    description:
      "Use verified StrangerChat accounts to send friend requests after anonymous chats and continue known-friend conversations.",
    canonical: "https://chatstranger.online/friends",
  },
  blog: {
    title: "Anonymous Chat Tips & Omegle Alternative Guides | StrangerChat",
    description:
      "Read StrangerChat guides for safer random chat, anonymous chat etiquette, video chat with strangers, and online chat rooms.",
    canonical: "https://chatstranger.online/blog",
  },
  about: {
    title: "About StrangerChat | Anonymous Random Chat",
    description:
      "Learn about StrangerChat, a free anonymous random chat and video chat platform with interest matching, rooms, and safety controls.",
    canonical: "https://chatstranger.online/about",
  },
  support: {
    title: "Support | StrangerChat",
    description:
      "Get help with StrangerChat random chat, anonymous video chat, private room tokens, accounts, verification, and safety reporting.",
    canonical: "https://chatstranger.online/support",
  },
};

function setMetaTag(selector: string, attribute: "content" | "href", value: string) {
  const element = document.head.querySelector(selector);
  if (element) element.setAttribute(attribute, value);
}

function scrollToCurrentHash() {
  const targetId = window.location.hash.replace(/^#/, "");
  if (!targetId || targetId === "home") {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  const target = document.getElementById(targetId);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function App() {
  const [page, setPage] = useState(pageFromLocation);
  const [authToken, setAuthToken] = useState(() => localStorage.getItem("auth_token") || "");
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [theme, setTheme] = useState<AppTheme>(initialTheme);
  const {
    status,
    messages,
    matchedFilters,
    chatId,
    peerTyping,
    mode,
    isInitiator,
    videoSignals,
    incomingFriendRequest,
    startChat,
    cancelSearch,
    sendMessage,
    sendTyping,
    sendVideoSignal,
    sendFriendRequest,
    respondToFriendRequest,
    skipChat,
    leaveCurrentChat,
    reportAndLeave,
  } = useChat(authToken);

  const handleVerificationHash = useCallback(() => {
    const token = verificationTokenFromLocation();
    if (!token) return false;

    void verifyAccountEmail(token)
      .then((data) => {
        localStorage.setItem("auth_token", data.token);
        setAuthToken(data.token);
        setCurrentUser(data.user);
        window.history.replaceState(null, "", `${window.location.pathname}#home`);
        alert("Email verified. You are logged in now.");
      })
      .catch((error) => {
        window.history.replaceState(null, "", `${window.location.pathname}#home`);
        alert(error instanceof Error ? error.message : "Verification failed. Please login normally.");
      });

    return true;
  }, []);

  useEffect(() => {
    const handleRouteChange = () => {
      if (handleVerificationHash()) return;
      setPage(pageFromLocation());
    };
    handleRouteChange();
    window.addEventListener("hashchange", handleRouteChange);
    window.addEventListener("popstate", handleRouteChange);
    return () => {
      window.removeEventListener("hashchange", handleRouteChange);
      window.removeEventListener("popstate", handleRouteChange);
    };
  }, [handleVerificationHash]);

  useEffect(() => {
    const metadata = routeMetadata[page] || routeMetadata.home;
    document.title = metadata.title;
    setMetaTag('meta[name="description"]', "content", metadata.description);
    setMetaTag('meta[property="og:title"]', "content", metadata.title);
    setMetaTag('meta[property="og:description"]', "content", metadata.description);
    setMetaTag('meta[property="og:url"]', "content", metadata.canonical);
    setMetaTag('meta[name="twitter:title"]', "content", metadata.title);
    setMetaTag('meta[name="twitter:description"]', "content", metadata.description);
    setMetaTag('link[rel="canonical"]', "href", metadata.canonical);
  }, [page]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("app_theme", theme);
  }, [theme]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(scrollToCurrentHash);
    return () => window.cancelAnimationFrame(frame);
  }, [page]);

  useEffect(() => {
    if (!authToken) {
      setCurrentUser(null);
      return;
    }
    void getCurrentUser(authToken)
      .then((data) => setCurrentUser(data.user))
      .catch(() => {
        localStorage.removeItem("auth_token");
        setAuthToken("");
      });
  }, [authToken]);

  function navigate(nextTarget: string) {
    const [nextPage, sectionId] = nextTarget.split("#");
    const nextPath = `${nextPage === "home" ? "/" : `/${nextPage}`}${sectionId ? `#${sectionId}` : ""}`;
    window.history.pushState(null, "", nextPath);
    setPage(nextPage);
    window.requestAnimationFrame(scrollToCurrentHash);
  }

  async function handleLogin(email: string, password: string) {
    const data = await loginAccount(email, password);
    localStorage.setItem("auth_token", data.token);
    setAuthToken(data.token);
    setCurrentUser(data.user);
  }

  async function handleRegister(email: string, username: string, password: string) {
    const data = await registerAccount(email, username, password);
    return data.verificationUrl || null;
  }

  function handleLogout() {
    localStorage.removeItem("auth_token");
    setAuthToken("");
    setCurrentUser(null);
  }

  async function handleChangePassword(currentPassword: string, newPassword: string) {
    await changeAccountPassword(currentPassword, newPassword, authToken);
  }

  function withNav(content: ReactNode) {
    return (
      <>
        <AppNav
          theme={theme}
          currentUser={currentUser}
          onNavigate={navigate}
          onThemeChange={setTheme}
          onLogin={handleLogin}
          onRegister={handleRegister}
          onLogout={handleLogout}
          onChangePassword={handleChangePassword}
        />
        {content}
        <AppFooter onNavigate={navigate} />
      </>
    );
  }

  if (status === "matched" || status === "disconnected" || status === "searching" || status === "generating-keys") {
    return (
      <ChatPage
        status={status}
        messages={messages}
        matchedFilters={matchedFilters}
        chatId={chatId}
        peerTyping={peerTyping}
        mode={mode}
        isInitiator={isInitiator}
        videoSignals={videoSignals}
        currentUser={currentUser}
        incomingFriendRequest={incomingFriendRequest}
        onSendMessage={sendMessage}
        onSendTyping={sendTyping}
        onSendVideoSignal={sendVideoSignal}
        onSendFriendRequest={() => sendFriendRequest(authToken)}
        onRespondFriendRequest={(requestId, action) => respondToFriendRequest(requestId, action, authToken)}
        onSkip={skipChat}
        onLeave={leaveCurrentChat}
        onReport={reportAndLeave}
      />
    );
  }

  if (page === "rooms") {
    return withNav(<RoomsPage onNavigate={navigate} />);
  }

  if (page === "friends") {
    return withNav(<FriendsPage authToken={authToken} currentUser={currentUser} />);
  }

  if (page === "blog" || page === "about" || page === "support") {
    return withNav(<ContentPage page={page} />);
  }

  return withNav(
    <HomePage
      status={status}
      matchedFilters={matchedFilters}
      onStartChat={startChat}
      onCancelSearch={cancelSearch}
      onNavigate={navigate}
    />
  );
}

export default App;
