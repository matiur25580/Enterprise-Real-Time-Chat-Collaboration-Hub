const express = require('express');
const Message = require('../models/Message');

const router = express.Router();

// Get all messages between two users
router.get('/:senderId/:receiverId', async (req, res) => {
  try {
    const { senderId, receiverId } = req.params;

    const messages = await Message.find({
      $or: [
        { senderId, receiverId },
        { senderId: receiverId, receiverId: senderId },
      ],
    }).sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send a message
router.post('/send', async (req, res) => {
  try {
    const { senderId, receiverId, content } = req.body;

    const message = new Message({ senderId, receiverId, content });
    await message.save();

    res.status(201).json({ message: 'Message sent', data: message });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark message as read
router.patch('/:messageId/read', async (req, res) => {
  try {
    const { messageId } = req.params;

    const message = await Message.findByIdAndUpdate(
      messageId,
      { read: true },
      { new: true }
    );

    res.json({ message: 'Message marked as read', data: message });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
