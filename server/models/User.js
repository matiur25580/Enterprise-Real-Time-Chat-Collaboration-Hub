const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 30, match: /^[a-zA-Z0-9_]+$/ },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  password: { type: String, required: true, minlength: 12, maxlength: 128, select: false },
  avatar: { type: String, default: null },
}, {
  timestamps: true,
  toJSON: { transform(_doc, ret) { delete ret.password; delete ret.__v; return ret; } },
});

userSchema.pre("save", async function () {
  if (this.isModified("password")) this.password = await bcrypt.hash(this.password, 12);
});
userSchema.methods.comparePassword = function (password) { return bcrypt.compare(password, this.password); };
module.exports = mongoose.model("User", userSchema);
