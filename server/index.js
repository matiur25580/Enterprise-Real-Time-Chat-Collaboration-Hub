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

const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.CORS_ORIGIN || "").split(",").map((origin) => origin.trim()).filter(Boolean);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins.length ? allowedOrigins : false,
  },
});

app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : false }));
app.use(express.json());

// --- Cloudinary কনফিগারেশন ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "chat_app_images",
    allowed_formats: ["jpg", "png", "jpeg"],
  },
});

const upload = multer({ storage: storage });

// ১. সব মেসেজ গেট করা
app.get("/messages", async (req, res) => {
  try {
    const messages = await Message.find().sort({ timestamp: 1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: "মেসেজ লোড করতে সমস্যা হয়েছে" });
  }
});

// ২. ছবি আপলোড API
app.post("/upload", upload.single("image"), (req, res) => {
  try {
    res.json({ imageUrl: req.file.path });
  } catch (err) {
    res.status(500).json({ error: "ছবি আপলোড ব্যর্থ হয়েছে" });
  }
});

// ৩. ডিলিট API
app.delete("/messages/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await Message.findByIdAndDelete(id);
    io.emit("message_deleted", id); 
    res.status(200).json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete" });
  }
});

// MongoDB কানেকশন
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch((err) => console.error("❌ DB Connection Error:", err));

// --- Socket.io লজিক ---
io.on("connection", (socket) => {
  console.log(`👤 User Connected: ${socket.id}`);

  // মেসেজ পাঠানো
  socket.on("send_message", async (data) => {
    try {
      console.log("📨 Received message:", data);
      
      const newMessage = new Message({
        sender: data.sender,
        content: data.content,
        imageUrl: data.imageUrl || null 
      });
      const savedMessage = await newMessage.save();
      console.log("✅ Message saved to DB:", savedMessage);
      
      io.emit("receive_message", savedMessage);
      console.log("📤 Broadcasted message to all clients");
    } catch (err) {
      console.error("❌ Error saving message:", err);
    }
  });

  // টাইপিং শুরু হলে
  socket.on("typing", (data) => {
    socket.broadcast.emit("display_typing", data);
  });

  // টাইপিং বন্ধ হলে
  socket.on("stop_typing", () => {
    socket.broadcast.emit("stop_typing");
  });

  // মেসেজ পড়া হলে (Seen)
  socket.on("mark_as_read", async (messageId) => {
    try {
      const updatedMessage = await Message.findByIdAndUpdate(
        messageId,
        { read: true },
        { new: true }
      );
      io.emit("message_read", updatedMessage);
    } catch (err) {
      console.error("Error marking message as read:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log("🚫 User Disconnected", socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`);
});