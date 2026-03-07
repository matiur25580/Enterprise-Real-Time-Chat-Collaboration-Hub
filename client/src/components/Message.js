import React from 'react';

function Message({ message }) {
  return (
    <div className="message">
      <div className="message-author">{message.author || 'Anonymous'}</div>
      <div className="message-text">{message.message}</div>
      <div className="message-time">
        {new Date(message.timestamp).toLocaleTimeString()}
      </div>
    </div>
  );
}

export default Message;
