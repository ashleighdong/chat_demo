import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const HTTP_BASE_URL = import.meta.env.VITE_HTTP_BASE_URL || "http://localhost:5000";
const WS_URL =
  import.meta.env.VITE_WS_URL ||
  HTTP_BASE_URL.replace(/^http:\/\//, "ws://").replace(/^https:\/\//, "wss://");

function App() {
  const [username, setUsername] = useState("guest");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const wsRef = useRef(null);
  const messagesEndRef = useRef(null);

  const sortedMessages = useMemo(() => {
    return [...messages].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [messages]);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setConnectionStatus("connected");
    ws.onclose = () => setConnectionStatus("disconnected");
    ws.onerror = () => setConnectionStatus("disconnected");

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "chat_history" && Array.isArray(data.payload)) {
          setMessages(data.payload);
          return;
        }

        if (data.type === "chat_message" && data.payload) {
          setMessages((current) => [...current, data.payload]);
        }
      } catch {
        // Ignore malformed messages to keep the UI responsive.
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sortedMessages]);

  function handleSendMessage(event) {
    event.preventDefault();

    if (!draft.trim() || !username.trim()) {
      return;
    }

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    ws.send(
      JSON.stringify({
        type: "chat_message",
        payload: {
          username: username.trim(),
          text: draft.trim(),
        },
      })
    );

    setDraft("");
  }

  return (
    <main className="chat-app">
      <header className="chat-header">
        <h1>Chat App</h1>
        <p className={`status status-${connectionStatus}`}>{connectionStatus}</p>
      </header>

      <section className="messages-panel" aria-label="Chat messages">
        {sortedMessages.length === 0 ? (
          <p className="empty-state">No messages yet. Start the conversation.</p>
        ) : (
          sortedMessages.map((message) => (
            <article className="message" key={message._id || `${message.username}-${message.createdAt}`}>
              <div className="message-meta">
                <strong>{message.username}</strong>
                <time>{new Date(message.createdAt).toLocaleTimeString()}</time>
              </div>
              <p>{message.text}</p>
            </article>
          ))
        )}
        <div ref={messagesEndRef} />
      </section>

      <form className="composer" onSubmit={handleSendMessage}>
        <input
          type="text"
          placeholder="Your name"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          maxLength={50}
          required
        />
        <input
          type="text"
          placeholder="Type a message..."
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={2000}
          required
        />
        <button type="submit">Send</button>
      </form>
    </main>
  );
}

export default App;
