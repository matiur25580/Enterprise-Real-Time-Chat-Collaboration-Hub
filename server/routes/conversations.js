const express = require("express");
const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const User = require("../models/User");
const { isConversationMember } = require("../middleware/conversation-access");

const router = express.Router();

// List only direct conversations in which the authenticated account participates.
router.get("/", async (req, res, next) => {
  try {
    const conversations = await Conversation.find({ participants: req.user._id })
      .populate("participants", "_id username avatar")
      .sort({ updatedAt: -1 })
      .lean();
    return res.json({ conversations });
  } catch (error) {
    return next(error);
  }
});

// Start or reopen a direct conversation with an existing account by username.
router.post("/", async (req, res, next) => {
  try {
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      return res.status(400).json({ error: "Enter a valid username." });
    }
    const otherUser = await User.findOne({ username }).select("_id username avatar");
    if (!otherUser) return res.status(404).json({ error: "User not found." });
    if (String(otherUser._id) === String(req.user._id)) {
      return res.status(400).json({ error: "You cannot start a conversation with yourself." });
    }

    const participantIds = [String(req.user._id), String(otherUser._id)].sort();
    const directKey = participantIds.join(":");
    const conversation = await Conversation.findOneAndUpdate(
      { directKey },
      { $setOnInsert: { participants: participantIds, directKey, createdBy: req.user._id } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).populate("participants", "_id username avatar");

    return res.status(200).json({ conversation });
  } catch (error) {
    if (error?.code === 11000) {
      const participantIds = [String(req.user._id), String(req.body?.username)].sort();
      return res.status(409).json({ error: "Conversation already exists. Refresh your conversation list." });
    }
    return next(error);
  }
});

// Conversation history is never queried until membership has been confirmed.
router.get("/:conversationId/messages", async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    if (!mongoose.isValidObjectId(conversationId)) {
      return res.status(400).json({ error: "Invalid conversation identifier." });
    }
    const conversation = await Conversation.findById(conversationId).select("participants").lean();
    if (!isConversationMember(conversation, req.user._id)) {
      return res.status(404).json({ error: "Conversation not found." });
    }
    const messages = await Message.find({ conversationId })
      .sort({ timestamp: -1 })
      .limit(100)
      .lean();
    return res.json(messages.reverse());
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
