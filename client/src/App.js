import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import axios from "axios";
import EmojiPicker from "emoji-picker-react";
import "./App.css";

// The socket is created once and authenticated only after a valid API session exists.
const socket = io({ autoConnect: false });

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ username: "", email: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [contactUsername, setContactUsername] = useState("");
  const [contactError, setContactError] = useState("");
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [typingUser, setTypingUser] = useState("");
  const lastMessageRef = useRef(null);
  const messageContainerRef = useRef(null);
  const activeConversationRef = useRef(null);
  const sender = user ? user.username : "";

  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  const otherParticipant = (conversation) =>
    conversation?.participants?.find((participant) => participant._id !== user?.id);

  // Restore a session only after the server validates the saved bearer token.
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

  // Establish the authenticated socket and load only conversations belonging to this account.
  useEffect(() => {
    if (!user || !token) return undefined;
    axios.defaults.headers.common.Authorization = "Bearer " + token;
    socket.auth = { token };
    socket.connect();

    axios.get("/api/conversations")
      .then((response) => {
        const items = response.data.conversations || [];
        setConversations(items);
        setActiveConversation((current) => current || items[0] || null);
      })
      .catch((error) => console.error("Unable to load conversations:", error));

    socket.on("receive_message", (data) => setChat((previous) => [...previous, data]));
    socket.on("message_deleted", (id) => setChat((previous) => previous.filter((item) => item._id !== id)));
    socket.on("message_read", (updated) => setChat((previous) =>
      previous.map((item) => item._id === updated._id ? updated : item)));
    socket.on("display_typing", (data) => {
      if (data.conversationId === activeConversationRef.current?._id && data.sender !== sender) {
        setTypingUser(data.sender);
        setIsTyping(true);
      }
    });
    socket.on("stop_typing", (data) => {
      if (!data?.conversationId || data.conversationId === activeConversationRef.current?._id) setIsTyping(false);
    });

    return () => {
      socket.off("receive_message");
      socket.off("message_deleted");
      socket.off("message_read");
      socket.off("display_typing");
      socket.off("stop_typing");
      socket.disconnect();
    };
  }, [user, token, sender]);

  // Join only the selected conversation, then request its bounded message history.
  useEffect(() => {
    if (!user || !token || !activeConversation?._id) {
      setChat([]);
      return undefined;
    }
    const conversationId = activeConversation._id;
    setChat([]);
    setIsTyping(false);
    socket.emit("join_conversation", conversationId, (result) => {
      if (!result?.ok) {
        setContactError(result?.error || "Unable to open this conversation.");
        return;
      }
      axios.get("/api/conversations/" + conversationId + "/messages")
        .then((response) => setChat(response.data))
        .catch((error) => console.error("Unable to load conversation messages:", error));
    });

    return () => {
      socket.emit("leave_conversation", conversationId);
    };
  }, [user, token, activeConversation?._id]);

  useEffect(() => {
    lastMessageRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  // Observe unread messages once per render and mark them read only in the active room.
  useEffect(() => {
    const container = messageContainerRef.current;
    if (!container || !activeConversation?._id) return undefined;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const messageId = entry.target.getAttribute("data-message-id");
        if (messageId) {
          socket.emit("mark_as_read", { messageId, conversationId: activeConversation._id });
          observer.unobserve(entry.target);
        }
      });
    });
    container.querySelectorAll("[data-message-id]").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [chat, activeConversation?._id]);

  const handleTyping = (event) => {
    setMessage(event.target.value);
    if (activeConversation?._id) {
      socket.emit("typing", activeConversation._id);
      clearTimeout(window.typingTimeout);
      window.typingTimeout = setTimeout(() => {
        socket.emit("stop_typing", activeConversation._id);
      }, 2000);
    }
  };

  const sendMessage = (event) => {
    if (event) event.preventDefault();
    if (!message.trim() || !activeConversation?._id) return;
    socket.emit("send_message", {
      conversationId: activeConversation._id,
      content: message,
    }, (result) => {
      if (!result?.ok) setContactError(result?.error || "Message could not be sent.");
    });
    socket.emit("stop_typing", activeConversation._id);
    setMessage("");
    setShowEmoji(false);
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !activeConversation?._id) return;
    const formData = new FormData();
    formData.append("image", file);
    setUploading(true);
    try {
      const response = await axios.post(
        "/upload?conversationId=" + encodeURIComponent(activeConversation._id),
        formData
      );
      socket.emit("send_message", {
        conversationId: activeConversation._id,
        content: "📷 Photo",
        imageUrl: response.data.imageUrl,
      }, (result) => {
        if (!result?.ok) setContactError(result?.error || "Image message could not be sent.");
      });
    } catch (error) {
      setContactError(error.response?.data?.error || "Image upload failed.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const deleteMessage = async (id) => {
    if (!id || !window.confirm("Delete this message?")) return;
    try {
      await axios.delete("/messages/" + id);
      setChat((previous) => previous.filter((item) => item._id !== id));
    } catch (error) {
      setContactError(error.response?.data?.error || "Message could not be deleted.");
    }
  };

  const createConversation = async (event) => {
    event.preventDefault();
    setContactError("");
    try {
      const response = await axios.post("/api/conversations", { username: contactUsername });
      const conversation = response.data.conversation;
      setConversations((previous) => [
        conversation,
        ...previous.filter((item) => item._id !== conversation._id),
      ]);
      setActiveConversation(conversation);
      setContactUsername("");
    } catch (error) {
      setContactError(error.response?.data?.error || "Unable to start this conversation.");
    }
  };

  const submitAuth = async (event) => {
    event.preventDefault();
    setAuthError("");
    setAuthBusy(true);
    try {
      const endpoint = authMode === "register" ? "/api/auth/register" : "/api/auth/login";
      const payload = authMode === "register"
        ? authForm
        : { email: authForm.email, password: authForm.password };
      const response = await axios.post(endpoint, payload);
      sessionStorage.setItem("chat_token", response.data.token);
      setToken(response.data.token);
      setUser(response.data.user);
      setConversations([]);
      setActiveConversation(null);
      setChat([]);
    } catch (error) {
      setAuthError(error.response?.data?.error || "Unable to authenticate. Please try again.");
    } finally {
      setAuthBusy(false);
    }
  };

  const logout = () => {
    socket.disconnect();
    sessionStorage.removeItem("chat_token");
    delete axios.defaults.headers.common.Authorization;
    setToken("");
    setUser(null);
    setConversations([]);
    setActiveConversation(null);
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
          <h3>💬 Private Chat</h3>
          <span>{sender}</span>
          <button type="button" onClick={logout}>Sign out</button>
        </div>
        <form onSubmit={createConversation} className="chat-footer" style={{ gap: 8 }}>
          <input className="msg-input" value={contactUsername} placeholder="Start chat with username…" onChange={(event) => setContactUsername(event.target.value)} required />
          <button className="send-btn" type="submit">Open</button>
        </form>
        <div className="chat-footer" style={{ gap: 6, overflowX: "auto" }}>
          {conversations.map((conversation) => {
            const other = otherParticipant(conversation);
            return (
              <button key={conversation._id} type="button"
                className="emoji-btn"
                aria-pressed={activeConversation?._id === conversation._id}
                onClick={() => setActiveConversation(conversation)}>
                {other?.username || "Conversation"}
              </button>
            );
          })}
        </div>
        {contactError && <p role="alert" style={{ padding: "0 12px" }}>{contactError}</p>}
        <div className="message-container" ref={messageContainerRef}>
          {activeConversation ? chat.map((msg, index) => (
            <div key={msg._id || index} className={"message " + (msg.sender === sender ? "own-message" : "")}>
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
              {!msg.read && msg.sender !== sender && msg._id && (
                <span className="message-read-trigger" data-message-id={msg._id} />
              )}
            </div>
          )) : <p style={{ padding: 20 }}>Start a private conversation by entering another member’s username above.</p>}
          {isTyping && <div className="typing-indicator">✍️ {typingUser} is typing...</div>}
          <div ref={lastMessageRef} />
        </div>
        {showEmoji && <div className="emoji-picker"><EmojiPicker onEmojiClick={(emoji) => setMessage((previous) => previous + emoji.emoji)} /></div>}
        <div className="chat-footer">
          <input type="file" accept="image/jpeg,image/png,image/webp" id="fileInput" style={{ display: "none" }} onChange={handleImageUpload} />
          <button type="button" onClick={() => document.getElementById("fileInput").click()} className="emoji-btn" disabled={!activeConversation}>{uploading ? "⏳" : "🖼️"}</button>
          <button type="button" onClick={() => setShowEmoji(!showEmoji)} className="emoji-btn" disabled={!activeConversation}>😊</button>
          <input className="msg-input" value={message} placeholder={activeConversation ? "Type message..." : "Choose a conversation"} onChange={handleTyping} onKeyDown={(event) => event.key === "Enter" && sendMessage(event)} disabled={!activeConversation} />
          <button className="send-btn" onClick={sendMessage} disabled={!activeConversation}>Send</button>
        </div>
      </div>
    </div>
  );
}

export default App;
