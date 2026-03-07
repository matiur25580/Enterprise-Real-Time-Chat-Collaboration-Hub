import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import axios from "axios";
import EmojiPicker from 'emoji-picker-react';
import "./App.css";

const socket = io("http://localhost:5000");

function App() {
  const [sender, setSender] = useState("");
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // টাইপিং ফিচারের জন্য স্টেট
  const [isTyping, setIsTyping] = useState(false); 
  const [typingUser, setTypingUser] = useState(""); 
  
  const lastMessageRef = useRef(null);

  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const response = await axios.get("http://localhost:5000/messages");
        setChat(response.data);
      } catch (err) {
        console.error("মেসেজ লোড করতে সমস্যা:", err);
      }
    };
    fetchMessages();

    socket.on("receive_message", (data) => {
      setChat((prev) => [...prev, data]);
    });

    socket.on("message_deleted", (id) => {
      setChat((prev) => prev.filter((msg) => msg._id !== id));
    });

    // মেসেজ পড়া হলে আপডেট করা
    socket.on("message_read", (updatedMessage) => {
      setChat((prev) => 
        prev.map((msg) => msg._id === updatedMessage._id ? updatedMessage : msg)
      );
    });

    // অন্যের টাইপিং ইভেন্ট রিসিভ করা
    socket.on("display_typing", (data) => {
      if (data.sender !== sender) {
        setTypingUser(data.sender);
        setIsTyping(true);
      }
    });

    socket.on("stop_typing", () => {
      setIsTyping(false);
    });

    return () => {
      socket.off("receive_message");
      socket.off("message_deleted");
      socket.off("message_read");
      socket.off("display_typing");
      socket.off("stop_typing");
    };
  }, [sender]);

  useEffect(() => {
    lastMessageRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  // ইনপুট বক্সে টাইপ করার সময় ইভেন্ট পাঠানো
  const handleTyping = (e) => {
    setMessage(e.target.value);

    if (sender.trim() !== "") {
      socket.emit("typing", { sender });

      // টাইপিং থামানোর ২ সেকেন্ড পর সিগন্যাল পাঠানো
      clearTimeout(window.typingTimeout);
      window.typingTimeout = setTimeout(() => {
        socket.emit("stop_typing");
      }, 2000);
    }
  };

  const sendMessage = (e) => {
    if (e) e.preventDefault();
    
    console.log("Socket connected:", socket.connected);
    console.log("Sender:", sender, "Message:", message);
    
    if (message.trim() !== "" && sender.trim() !== "") {
      const messageData = { sender, content: message };
      console.log("Sending message:", messageData);
      socket.emit("send_message", messageData);
      socket.emit("stop_typing");
      setMessage(""); 
      setShowEmoji(false);
    } else {
      alert("Please enter both Name and Message!");
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (sender.trim() === "") {
      alert("Please enter your name first!");
      return;
    }

    const formData = new FormData();
    formData.append("image", file);

    setUploading(true);
    try {
      const res = await axios.post("http://localhost:5000/upload", formData);
      const messageData = { 
        sender, 
        content: "📷 Photo", 
        imageUrl: res.data.imageUrl, 
        timestamp: new Date() 
      };
      socket.emit("send_message", messageData);
    } catch (err) {
      alert("ছবি আপলোড করতে সমস্যা হয়েছে!");
    } finally {
      setUploading(false);
    }
  };

  const deleteMessage = async (id) => {
    if (!id) return;
    if (window.confirm("আপনি কি নিশ্চিতভাবে এই মেসেজটি ডিলিট করতে চান?")) {
      try {
        const res = await axios.delete(`http://localhost:5000/messages/${id}`);
        if (res.status === 200) {
          setChat((prevChat) => prevChat.filter((msg) => msg._id !== id));
        }
      } catch (err) {
        alert("মেসেজ ডিলিট করা যায়নি!");
      }
    }
  };

  const onEmojiClick = (emojiData) => {
    setMessage(prev => prev + emojiData.emoji);
  };

  return (
    <div className="App">
      <div className="chat-window">
        <div className="chat-header">
          <h3>💬 Live Chat Box</h3>
        </div>
        
        <div className="message-container">
          {chat.map((msg, index) => (
            <div key={msg._id || index} className={`message ${msg.sender === sender ? "own-message" : ""}`} 
              ref={(el) => {
                if (el && !msg.read && msg.sender !== sender) {
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
                {msg.sender === sender && (
                  <button className="delete-btn" onClick={() => deleteMessage(msg._id)}>🗑️</button>
                )}
              </div>
              {msg.imageUrl && <img src={msg.imageUrl} alt="sent" className="chat-image" />}
              <p className="message-text">{msg.content}</p>
              <div className="message-footer">
                <span className="message-time">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                {msg.sender === sender && (
                  <span className={`message-tick ${msg.read ? "blue-tick" : "grey-tick"}`}>
                    {msg.read ? "✔✔" : "✔"}
                  </span>
                )}
              </div>
            </div>
          ))}
          
          {/* টাইপিং ইন্ডিকেটর এখানে দেখাবে */}
          {isTyping && <div className="typing-indicator">✍️ {typingUser} is typing...</div>}
          
          <div ref={lastMessageRef} />
        </div>

        {showEmoji && (
          <div className="emoji-picker">
            <EmojiPicker onEmojiClick={onEmojiClick} />
          </div>
        )}

        <div className="chat-footer">
          <input 
            className="name-input" 
            placeholder="Name" 
            value={sender} 
            onChange={(e) => setSender(e.target.value)} 
          />
          
          <input 
            type="file" 
            accept="image/*" 
            id="fileInput" 
            style={{ display: "none" }} 
            onChange={handleImageUpload} 
          />
          
          <button type="button" onClick={() => document.getElementById("fileInput").click()} className="emoji-btn">
            {uploading ? "⏳" : "🖼️"}
          </button>
          
          <button type="button" onClick={() => setShowEmoji(!showEmoji)} className="emoji-btn">😊</button>
          
          <input 
            className="msg-input" 
            value={message} 
            placeholder="Type message..." 
            onChange={handleTyping} 
            onKeyDown={(e) => e.key === "Enter" && sendMessage(e)}
          />
          <button className="send-btn" onClick={sendMessage}>Send</button>
        </div>
      </div>
    </div>
  );
}

export default App;