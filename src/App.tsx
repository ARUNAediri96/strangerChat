import { useChat } from "./lib/use-chat";
import HomePage from "./pages/HomePage";
import ChatPage from "./pages/ChatPage";

function App() {
  const {
    status,
    messages,
    matchedFilters,
    chatId,
    peerTyping,
    mode,
    isInitiator,
    videoSignals,
    startChat,
    cancelSearch,
    sendMessage,
    sendTyping,
    sendVideoSignal,
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
        chatId={chatId}
        peerTyping={peerTyping}
        mode={mode}
        isInitiator={isInitiator}
        videoSignals={videoSignals}
        onSendMessage={sendMessage}
        onSendTyping={sendTyping}
        onSendVideoSignal={sendVideoSignal}
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
