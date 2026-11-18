const mongoose = require("mongoose");

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
