const mongoose = require("mongoose");

// Every message belongs to one direct conversation; sender identity is server-derived.
const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    sender: { type: String, required: true, trim: true, maxlength: 80 },
    content: { type: String, default: "", maxlength: 5000 },
    imageUrl: { type: String, default: null, maxlength: 2048 },
    read: { type: Boolean, default: false },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: false, versionKey: false }
);

messageSchema.index({ conversationId: 1, timestamp: -1 });
module.exports = mongoose.model("Message", messageSchema);
