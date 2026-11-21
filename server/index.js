const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
require("dotenv").config();

const Message = require("./models/Message");
const User = require("./models/User");
const jwt = require("jsonwebtoken");
const { authenticate, getJwtSecret } = require("./middleware/authenticate");
const authRoutes = require("./routes/auth");
const { createSocketEventLimiter } = require("./middleware/socket-rate-limit");

try { getJwtSecret(); } catch (error) { console.error(error.message); process.exit(1); }

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

// Return a bounded, chronological message history.
app.get("/messages", authenticate, async (_req, res, next) => {
  try {
    const messages = await Message.find()
      .sort({ timestamp: -1 })
      .limit(100)
      .lean();
    res.json(messages.reverse());
  } catch (error) {
    next(error);
  }
});

app.post("/upload", authenticate, (req, res, next) => {
  upload.single("image")(req, res, (error) => {
    if (error) return next(error);
    if (!req.file) {
      return res.status(400).json({ error: "An image file is required." });
    }
    return res.status(201).json({ imageUrl: req.file.path });
  });
});

app.delete("/messages/:id", authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid message id." });
    }

    const deletedMessage = await Message.findOneAndDelete({ _id: id, sender: req.user.username });
    if (!deletedMessage) {
      return res.status(404).json({ error: "Message not found." });
    }

    io.emit("message_deleted", id);
    return res.status(200).json({ message: "Deleted successfully." });
  } catch (error) {
    return next(error);
  }
});

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
  console.log("User connected:", socket.id);
  const eventLimiter = createSocketEventLimiter({
    limits: {
      send_message: { maxEvents: 30, windowMs: 60_000 },
      typing: { maxEvents: 10, windowMs: 10_000 },
    },
  });

  socket.on("send_message", async (data) => {
    if (!eventLimiter.allow("send_message")) {
      socket.emit("message_error", { message: "You are sending messages too quickly. Please wait." });
      return;
    }
    try {
      if (!data || typeof data !== "object") return;

      const sender = socket.user.username;
      const content = typeof data.content === "string" ? data.content.trim() : "";
      const imageUrl = typeof data.imageUrl === "string" ? data.imageUrl.trim() : "";

      if (!sender || sender.length > 80) return;
      if (content.length > 5000 || imageUrl.length > 2048) return;
      if (!content && !imageUrl) return;

      const savedMessage = await Message.create({
        sender,
        content,
        imageUrl: imageUrl || null,
      });
      io.emit("receive_message", savedMessage);
    } catch (error) {
      console.error("Unable to save incoming message:", error.message);
      socket.emit("message_error", { message: "Message could not be sent." });
    }
  });

  socket.on("typing", () => {
    if (!eventLimiter.allow("typing")) return;
    socket.broadcast.emit("display_typing", { sender: socket.user.username });
  });

  socket.on("stop_typing", () => {
    socket.broadcast.emit("stop_typing");
  });

  socket.on("mark_as_read", async (messageId) => {
    try {
      if (!isValidObjectId(messageId)) return;
      const message = await Message.findById(messageId);
      if (!message || message.sender === socket.user.username) return;
      const updatedMessage = await Message.findByIdAndUpdate(
        messageId,
        { read: true },
        { new: true }
      );
      if (updatedMessage) io.emit("message_read", updatedMessage);
    } catch (error) {
      console.error("Unable to mark message as read:", error.message);
    }
  });

  socket.on("disconnect", () => {
    eventLimiter.reset();
    console.log("User disconnected:", socket.id);
  });
});

app.use((error, _req, res, _next) => {
  console.error("Request failed:", error.message);
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "Image must be 5 MB or smaller." });
  }
  if (error.message?.includes("Only JPEG")) {
    return res.status(400).json({ error: error.message });
  }
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

mongoose
  .connect(MONGO_URL)
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Chat server listening on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  });
