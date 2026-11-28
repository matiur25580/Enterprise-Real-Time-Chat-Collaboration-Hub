const mongoose = require("mongoose");

// A direct conversation is private to its two persisted participant accounts.
const conversationSchema = new mongoose.Schema({
  participants: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],
    validate: {
      validator: (participants) => Array.isArray(participants) && participants.length === 2 &&
        String(participants[0]) !== String(participants[1]),
      message: "A direct conversation must have exactly two distinct participants.",
    },
  },
  directKey: { type: String, required: true, unique: true, immutable: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

conversationSchema.index({ participants: 1, updatedAt: -1 });
module.exports = mongoose.model("Conversation", conversationSchema);
