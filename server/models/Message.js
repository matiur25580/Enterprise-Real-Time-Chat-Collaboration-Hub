const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  sender: { 
    type: String, 
    required: true 
  },
  content: { 
    type: String, 
    required: true 
  },
  imageUrl: { 
    type: String, 
    default: null // যদি ছবি না থাকে তবে এটি খালি থাকবে
  },
  read: { 
    type: Boolean, 
    default: false // নতুন মেসেজ ডিফল্টভাবে 'Unread' থাকবে
  },
  timestamp: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model("Message", MessageSchema);