import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import axios from "axios";
import EmojiPicker from "emoji-picker-react";
import "./App.css";

// Keep one Socket.IO client instance; connect only after the user has authenticated.
const socket = io({ autoConnect: false });

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ username: "", email: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [typingUser, setTypingUser] = useState("");
  const lastMessageRef = useRef(null);
  const sender = user ? user.username : "";

  // Restore the previous session by validating the token with the server on app startup.
  useEffect(() => {
    const savedToken = sessionStorage.getItem("chat_token");
    if (!savedToken) return;
    axios.get("/api/auth/me", { headers: { Authorization: "Bearer " + savedToken } })
      .then((response) => {
        setToken(savedToken);
        setUser(response.data.user);
      })
      .catch(() => sessionStorage.removeItem("chat_token"));
  }, []);

  // Connect the live channel, load history, and subscribe to chat events for the signed-in user.
  useEffect(() => {
    if (!user || !token) return undefined;
    axios.defaults.headers.common.Authorization = "Bearer " + token;
    socket.auth = { token };
    socket.connect();

    axios.get("/messages")
      .then((response) => setChat(response.data))
      .catch((error) => console.error("Unable to load messages:", error));

    socket.on("receive_message", (data) => setChat((prev) => [...prev, data]));
    socket.on("message_deleted", (id) => setChat((prev) => prev.filter((msg) => msg._id !== id)));
    socket.on("message_read", (updated) => setChat((prev) => prev.map((msg) => msg._id === updated._id ? updated : msg)));
    socket.on("display_typing", (data) => {
      if (data.sender !== sender) {
        setTypingUser(data.sender);
        setIsTyping(true);
      }
    });
    socket.on("stop_typing", () => setIsTyping(false));

    return () => {
      socket.off("receive_message");
      socket.off("message_deleted");
      socket.off("message_read");
      socket.off("display_typing");
      socket.off("stop_typing");
      socket.disconnect();
    };
  }, [user, token, sender]);

  useEffect(() => {
    lastMessageRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  // Broadcast typing state and automatically stop it after a short idle period.
  const handleTyping = (event) => {
    setMessage(event.target.value);
    if (user) {
      socket.emit("typing");
      clearTimeout(window.typingTimeout);
      window.typingTimeout = setTimeout(() => socket.emit("stop_typing"), 2000);
    }
  };

  // Send message content over the authenticated socket; the server persists and broadcasts it.
  const sendMessage = (event) => {
    if (event) event.preventDefault();
    if (!message.trim() || !user) return;
    socket.emit("send_message", { content: message });
    socket.emit("stop_typing");
    setMessage("");
    setShowEmoji(false);
  };

  // Upload the selected image first, then send its hosted URL as a normal chat message.
  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !user) return;
    const formData = new FormData();
    formData.append("image", file);
    setUploading(true);
    try {
      const response = await axios.post("/upload", formData);
      socket.emit("send_message", { content: "📷 Photo", imageUrl: response.data.imageUrl });
    } catch (_error) {
      alert("Image upload failed.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  // Ask the API to delete only the current user's message, then update the local chat view.
  const deleteMessage = async (id) => {
    if (!id || !window.confirm("Delete this message?")) return;
    try {
      await axios.delete("/messages/" + id);
      setChat((previous) => previous.filter((msg) => msg._id !== id));
    } catch (error) {
      alert(error.response?.data?.error || "Message could not be deleted.");
    }
  };

  // Share one form handler for registration and login, while keeping their request payloads distinct.
  const submitAuth = async (event) => {
    event.preventDefault();
    setAuthError("");
    setAuthBusy(true);
    try {
      const endpoint = authMode === "register" ? "/api/auth/register" : "/api/auth/login";
      const payload = authMode === "register" ? authForm : { email: authForm.email, password: authForm.password };
      const response = await axios.post(endpoint, payload);
      sessionStorage.setItem("chat_token", response.data.token);
      setToken(response.data.token);
      setUser(response.data.user);
      setChat([]);
    } catch (error) {
      setAuthError(error.response?.data?.error || "Unable to authenticate. Please try again.");
    } finally {
      setAuthBusy(false);
    }
  };

  // Disconnect live events and clear session credentials and user-specific UI state.
  const logout = () => {
    socket.disconnect();
    sessionStorage.removeItem("chat_token");
    delete axios.defaults.headers.common.Authorization;
    setToken("");
    setUser(null);
    setChat([]);
    setMessage("");
  };

  if (!user) {
    return (
      <div className="App">
        <form className="chat-window" onSubmit={submitAuth}>
          <div className="chat-header"><h3>{authMode === "register" ? "Create account" : "Sign in to chat"}</h3></div>
          <div className="chat-footer" style={{ display: "flex", flexDirection: "column", padding: 20, gap: 12 }}>
            {authMode === "register" && <input className="name-input" placeholder="Username" minLength={3} maxLength={30} value={authForm.username} onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })} required />}
            <input className="name-input" type="email" placeholder="Email" value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} required />
            <input className="msg-input" type="password" placeholder="Password (12+ characters)" minLength={12} maxLength={128} value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} required />
            {authError && <p role="alert">{authError}</p>}
            <button className="send-btn" type="submit" disabled={authBusy}>{authBusy ? "Please wait…" : authMode === "register" ? "Create account" : "Sign in"}</button>
            <button type="button" onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setAuthError(""); }}>
              {authMode === "login" ? "Need an account? Register" : "Already registered? Sign in"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="App">
      <div className="chat-window">
        <div className="chat-header">
          <h3>💬 Live Chat Box</h3>
          <span>{sender}</span>
          <button type="button" onClick={logout}>Sign out</button>
        </div>
        <div className="message-container">
          {/* Render each message and observe incoming messages to mark them read when visible. */}
          {chat.map((msg, index) => (
            <div key={msg._id || index} className={"message " + (msg.sender === sender ? "own-message" : "")}
              ref={(el) => {
                if (el && !msg.read && msg.sender !== sender && msg._id) {
                  const observer = new IntersectionObserver(([entry]) => {
                    if (entry.isIntersecting) {
                      socket.emit("mark_as_read", msg._id);
                      observer.unobserve(el);
                    }
                  });
                  observer.observe(el);
                }
              }}>
              <div className="msg-header">
                <p className="sender-name">{msg.sender}</p>
                {msg.sender === sender && <button className="delete-btn" onClick={() => deleteMessage(msg._id)}>🗑️</button>}
              </div>
              {msg.imageUrl && <img src={msg.imageUrl} alt="sent" className="chat-image" />}
              <p className="message-text">{msg.content}</p>
              <div className="message-footer">
                <span className="message-time">{new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                {msg.sender === sender && <span className={"message-tick " + (msg.read ? "blue-tick" : "grey-tick")}>{msg.read ? "✔✔" : "✔"}</span>}
              </div>
            </div>
          ))}
          {isTyping && <div className="typing-indicator">✍️ {typingUser} is typing...</div>}
          <div ref={lastMessageRef} />
        </div>
        {showEmoji && <div className="emoji-picker"><EmojiPicker onEmojiClick={(emoji) => setMessage((prev) => prev + emoji.emoji)} /></div>}
        <div className="chat-footer">
          <input type="file" accept="image/jpeg,image/png,image/webp" id="fileInput" style={{ display: "none" }} onChange={handleImageUpload} />
          <button type="button" onClick={() => document.getElementById("fileInput").click()} className="emoji-btn">{uploading ? "⏳" : "🖼️"}</button>
          <button type="button" onClick={() => setShowEmoji(!showEmoji)} className="emoji-btn">😊</button>
          <input className="msg-input" value={message} placeholder="Type message..." onChange={handleTyping} onKeyDown={(e) => e.key === "Enter" && sendMessage(e)} />
          <button className="send-btn" onClick={sendMessage}>Send</button>
        </div>
      </div>
    </div>
  );
}

export default App;
