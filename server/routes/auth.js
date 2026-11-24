const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { getJwtSecret, authenticate } = require("../middleware/authenticate");

const router = express.Router();

// Issue a short-lived JWT whose subject identifies the authenticated database user.
function issueToken(user) {
  return jwt.sign({}, getJwtSecret(), { subject: user._id.toString(), expiresIn: "12h", algorithm: "HS256" });
}
// Whitelist public profile fields so password and internal model data are never returned.
function publicUser(user) {
  return { id: user._id.toString(), username: user.username, email: user.email, avatar: user.avatar || null };
}

// Registration validates input, prevents duplicate accounts, then returns a token and safe profile.
router.post("/register", async (req, res, next) => {
  try {
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) return res.status(400).json({ error: "Username must be 3–30 characters using letters, numbers or underscores." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: "A valid email address is required." });
    if (password.length < 12 || password.length > 128) return res.status(400).json({ error: "Password must be between 12 and 128 characters." });
    const existing = await User.findOne({ $or: [{ email }, { username: username.toLowerCase() }] });
    if (existing) return res.status(409).json({ error: "Username or email is already registered." });
    const user = await User.create({ username, email, password });
    return res.status(201).json({ token: issueToken(user), user: publicUser(user) });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: "Username or email is already registered." });
    return next(error);
  }
});

// Login loads the password hash explicitly because it is hidden by the User schema by default.
router.post("/login", async (req, res, next) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!email || !password) return res.status(400).json({ error: "Email and password are required." });
    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await user.comparePassword(password))) return res.status(401).json({ error: "Invalid email or password." });
    return res.json({ token: issueToken(user), user: publicUser(user) });
  } catch (error) { return next(error); }
});

router.get("/me", authenticate, (req, res) => res.json({ user: publicUser(req.user) }));
module.exports = router;
