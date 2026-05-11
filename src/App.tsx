import { useChat } from "./lib/use-chat";
import HomePage from "./pages/HomePage";
import ChatPage from "./pages/ChatPage";

function App() {
  const {
    status,
    messages,
    matchedFilters,
    peerTyping,
    startChat,
    cancelSearch,
    sendMessage,
    sendTyping,
    skipChat,
    leaveCurrentChat,
    reportAndLeave,
  } = useChat();

  if (status === "matched" || status === "disconnected" || status === "searching" || status === "generating-keys") {
    return (
      <ChatPage
        status={status}
        messages={messages}
        matchedFilters={matchedFilters}
        peerTyping={peerTyping}
        onSendMessage={sendMessage}
        onSendTyping={sendTyping}
        onSkip={skipChat}
        onLeave={leaveCurrentChat}
        onReport={reportAndLeave}
      />
    );
  }

  return (
    <HomePage
      status={status}
      matchedFilters={matchedFilters}
      onStartChat={startChat}
      onCancelSearch={cancelSearch}
    />
  );
}

export default App;
