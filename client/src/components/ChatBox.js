import React, { useState } from 'react';

// Controlled input component: the parent owns message delivery through onSendMessage.
function ChatBox({ onSendMessage }) {
  const [message, setMessage] = useState('');

  // Ignore whitespace-only messages and clear the input after a successful callback.
  const handleSend = () => {
    if (message.trim()) {
      onSendMessage(message);
      setMessage('');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  return (
    <div className="chatbox">
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyPress={handleKeyPress}
        placeholder="Type a message..."
      />
      <button onClick={handleSend}>Send</button>
    </div>
  );
}

export default ChatBox;
