import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useChat } from "./lib/use-chat";
import HomePage from "./pages/HomePage";
import ChatPage from "./pages/ChatPage";
import RoomsPage from "./pages/RoomsPage";
import ContentPage from "./pages/ContentPage";
import FriendsPage from "./pages/FriendsPage";
import AppNav from "./components/AppNav";
import {
  changeAccountPassword,
  getCurrentUser,
  loginAccount,
  registerAccount,
  verifyAccountEmail,
  type AppUser,
} from "./lib/match-api";

function pageFromHash() {
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (hash.startsWith("verify=")) return "home";
  return hash || "home";
}

function verificationTokenFromLocation() {
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (hash.startsWith("verify=")) return decodeURIComponent(hash.slice("verify=".length));

  const hashParams = new URLSearchParams(hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : hash);
  const searchParams = new URLSearchParams(window.location.search);
  return hashParams.get("verify") || hashParams.get("token") || searchParams.get("verify") || searchParams.get("token");
}

function App() {
  const [page, setPage] = useState(pageFromHash);
  const [authToken, setAuthToken] = useState(() => localStorage.getItem("auth_token") || "");
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
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
    const handleHash = () => {
      if (handleVerificationHash()) return;
      setPage(pageFromHash());
    };
    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, [handleVerificationHash]);

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

  function navigate(nextPage: string) {
    window.location.hash = nextPage === "home" ? "" : nextPage;
    setPage(nextPage);
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
          currentUser={currentUser}
          onNavigate={navigate}
          onLogin={handleLogin}
          onRegister={handleRegister}
          onLogout={handleLogout}
          onChangePassword={handleChangePassword}
        />
        {content}
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
