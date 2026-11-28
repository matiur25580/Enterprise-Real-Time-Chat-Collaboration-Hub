// Express handles HTTP routes; Socket.IO provides authenticated, conversation-scoped events.
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const Message = require("./models/Message");
const Conversation = require("./models/Conversation");
const User = require("./models/User");
const { authenticate, getJwtSecret } = require("./middleware/authenticate");
const { isConversationMember } = require("./middleware/conversation-access");
const authRoutes = require("./routes/auth");
const conversationRoutes = require("./routes/conversations");
const { createSocketEventLimiter } = require("./middleware/socket-rate-limit");

// Fail closed: never start an API or socket server with a missing/weak signing secret.
try {
  getJwtSecret();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const io = new Server(server, {
  cors: { origin: allowedOrigins.length ? allowedOrigins : false },
});

app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : false }));
app.use(express.json({ limit: "16kb" }));
app.use("/api/auth", authRoutes);
app.use("/api/conversations", authenticate, conversationRoutes);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "chat_app_images",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.mimetype)) {
      return callback(new Error("Only JPEG, PNG, and WebP images are allowed."));
    }
    callback(null, true);
  },
});

const isValidObjectId = (id) => mongoose.isValidObjectId(id);
const roomFor = (conversationId) => `conversation:${conversationId}`;

async function findMembership(conversationId, userId) {
  if (!isValidObjectId(conversationId)) return null;
  const conversation = await Conversation.findById(conversationId).select("participants").lean();
  return isConversationMember(conversation, userId) ? conversation : null;
}

// Upload authorization is checked before Multer streams the file to remote storage.
app.post("/upload", authenticate, async (req, res, next) => {
  try {
    const conversationId = req.query.conversationId;
    if (!await findMembership(conversationId, req.user._id)) {
      return res.status(404).json({ error: "Conversation not found." });
    }
    return upload.single("image")(req, res, (error) => {
      if (error) return next(error);
      if (!req.file) return res.status(400).json({ error: "An image file is required." });
      return res.status(201).json({ imageUrl: req.file.path });
    });
  } catch (error) {
    return next(error);
  }
});

// A user may delete only their own message and only while belonging to its conversation.
app.delete("/messages/:id", authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid message id." });

    const existing = await Message.findOne({ _id: id, sender: req.user.username }).select("conversationId");
    if (!existing || !await findMembership(existing.conversationId, req.user._id)) {
      return res.status(404).json({ error: "Message not found." });
    }
    const deletedMessage = await Message.findOneAndDelete({
      _id: id,
      sender: req.user.username,
      conversationId: existing.conversationId,
    });
    if (!deletedMessage) return res.status(404).json({ error: "Message not found." });

    io.to(roomFor(existing.conversationId)).emit("message_deleted", id);
    return res.status(200).json({ message: "Deleted successfully." });
  } catch (error) {
    return next(error);
  }
});

// Authenticate every Socket.IO handshake and reload the account from MongoDB.
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string" || !token) return next(new Error("Authentication required."));
    const payload = jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"] });
    const user = await User.findById(payload.sub).select("_id username email avatar");
    if (!user) return next(new Error("Invalid authentication token."));
    socket.user = user;
    return next();
  } catch (_error) {
    return next(new Error("Invalid or expired authentication token."));
  }
});

io.on("connection", (socket) => {
  const eventLimiter = createSocketEventLimiter({
    limits: {
      send_message: { maxEvents: 30, windowMs: 60_000 },
      typing: { maxEvents: 10, windowMs: 10_000 },
      stop_typing: { maxEvents: 10, windowMs: 10_000 },
      mark_as_read: { maxEvents: 60, windowMs: 60_000 },
    },
  });

  socket.on("join_conversation", async (conversationId, acknowledge) => {
    try {
      const conversation = await findMembership(conversationId, socket.user._id);
      if (!conversation) {
        if (typeof acknowledge === "function") acknowledge({ ok: false, error: "Conversation not found." });
        return;
      }
      await socket.join(roomFor(conversationId));
      if (typeof acknowledge === "function") acknowledge({ ok: true });
    } catch (_error) {
      if (typeof acknowledge === "function") acknowledge({ ok: false, error: "Unable to join conversation." });
    }
  });

  socket.on("leave_conversation", (conversationId) => {
    if (isValidObjectId(conversationId)) socket.leave(roomFor(conversationId));
  });

  socket.on("send_message", async (data, acknowledge) => {
    if (!eventLimiter.allow("send_message")) {
      if (typeof acknowledge === "function") acknowledge({ ok: false, error: "You are sending messages too quickly." });
      return;
    }
    try {
      const conversationId = data?.conversationId;
      const room = roomFor(conversationId);
      if (!isValidObjectId(conversationId) || !socket.rooms.has(room) ||
          !await findMembership(conversationId, socket.user._id)) {
        if (typeof acknowledge === "function") acknowledge({ ok: false, error: "Conversation access denied." });
        return;
      }

      const content = typeof data.content === "string" ? data.content.trim() : "";
      const imageUrl = typeof data.imageUrl === "string" ? data.imageUrl.trim() : "";
      if (content.length > 5000 || imageUrl.length > 2048 || (!content && !imageUrl)) {
        if (typeof acknowledge === "function") acknowledge({ ok: false, error: "Invalid message content." });
        return;
      }

      const savedMessage = await Message.create({
        conversationId,
        sender: socket.user.username,
        content,
        imageUrl: imageUrl || null,
      });
      io.to(room).emit("receive_message", savedMessage);
      if (typeof acknowledge === "function") acknowledge({ ok: true, messageId: savedMessage._id });
    } catch (error) {
      console.error("Unable to save incoming message:", error.message);
      if (typeof acknowledge === "function") acknowledge({ ok: false, error: "Message could not be sent." });
    }
  });

  socket.on("typing", async (conversationId) => {
    if (!eventLimiter.allow("typing") || !isValidObjectId(conversationId)) return;
    const room = roomFor(conversationId);
    if (!socket.rooms.has(room) || !await findMembership(conversationId, socket.user._id)) return;
    socket.to(room).emit("display_typing", { sender: socket.user.username, conversationId });
  });

  socket.on("stop_typing", async (conversationId) => {
    if (!eventLimiter.allow("stop_typing") || !isValidObjectId(conversationId)) return;
    const room = roomFor(conversationId);
    if (!socket.rooms.has(room) || !await findMembership(conversationId, socket.user._id)) return;
    socket.to(room).emit("stop_typing", { conversationId });
  });

  socket.on("mark_as_read", async (data) => {
    try {
      const { messageId, conversationId } = data || {};
      if (!eventLimiter.allow("mark_as_read") || !isValidObjectId(messageId) ||
          !isValidObjectId(conversationId)) return;
      const room = roomFor(conversationId);
      if (!socket.rooms.has(room) || !await findMembership(conversationId, socket.user._id)) return;
      const updatedMessage = await Message.findOneAndUpdate(
        { _id: messageId, conversationId, sender: { $ne: socket.user.username } },
        { read: true },
        { new: true }
      );
      if (updatedMessage) io.to(room).emit("message_read", updatedMessage);
    } catch (error) {
      console.error("Unable to mark message as read:", error.message);
    }
  });

  socket.on("disconnect", () => eventLimiter.reset());
});

// Centralized error handling keeps upload, parsing, and route failures consistent.
app.use((error, _req, res, _next) => {
  console.error("Request failed:", error.message);
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "Image must be 5 MB or smaller." });
  }
  if (error.message?.includes("Only JPEG")) return res.status(400).json({ error: error.message });
  if (error instanceof SyntaxError && error.status === 400) {
    return res.status(400).json({ error: "Invalid JSON request body." });
  }
  return res.status(500).json({ error: "An unexpected server error occurred." });
});

const PORT = Number(process.env.PORT) || 5000;
const MONGO_URL = process.env.MONGO_URL;
if (!MONGO_URL) {
  console.error("MONGO_URL is required. Set it in server/.env before starting.");
  process.exit(1);
}

mongoose.connect(MONGO_URL)
  .then(() => server.listen(PORT, () => console.log(`Chat server listening on port ${PORT}`)))
  .catch((error) => {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  });
