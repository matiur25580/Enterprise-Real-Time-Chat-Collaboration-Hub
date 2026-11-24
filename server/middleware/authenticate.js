const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Read and validate the signing secret in one place for HTTP and Socket.IO authentication.
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters.");
  }
  return secret;
}

// Verify the Bearer token and attach the matching database user to the request.
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const payload = jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"] });
    const user = await User.findById(payload.sub).select("_id username email avatar");
    if (!user) return res.status(401).json({ error: "Invalid authentication token." });

    req.user = user;
    return next();
  } catch (_error) {
    return res.status(401).json({ error: "Invalid or expired authentication token." });
  }
}

module.exports = { authenticate, getJwtSecret };
