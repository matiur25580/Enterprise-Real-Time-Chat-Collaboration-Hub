const mongoose = require("mongoose");

// Schema defines the persisted shape and validation rules for each chat message.
const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    content: {
      type: String,
      default: "",
      maxlength: 5000,
    },
    imageUrl: {
      type: String,
      default: null,
      maxlength: 2048,
    },
    read: {
      type: Boolean,
      default: false,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

module.exports = mongoose.model("Message", messageSchema);
