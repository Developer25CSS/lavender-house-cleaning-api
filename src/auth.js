const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("./prisma");
const { requireAuth } = require("./middleware");
const asyncHandler = require("./asyncHandler");

const router = express.Router();

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );
}

// Used by the applicant-hiring flow to hand a new hire a one-time link to set
// their own password, instead of the owner needing to run seed-staff.js per hire.
function signInviteToken(userId) {
  return jwt.sign({ id: userId, purpose: "invite" }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

router.post("/signup", asyncHandler(async (req, res) => {
  const { email, password, name, phone } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: "Name, email and password are required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) return res.status(409).json({ error: "An account with that email already exists" });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email: email.toLowerCase(), passwordHash, name, phone },
  });

  res.cookie("token", signToken(user), COOKIE_OPTS);
  res.status(201).json({ id: user.id, email: user.email, name: user.name, role: user.role });
}));

router.post("/login", asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  res.cookie("token", signToken(user), COOKIE_OPTS);
  res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
}));

router.post("/logout", (req, res) => {
  res.clearCookie("token", COOKIE_OPTS);
  res.status(204).end();
});

router.get("/me", requireAuth, (req, res) => {
  res.json(req.user);
});

// Consumes an invite token (issued when staff marks an applicant HIRED) so a
// new hire can set their own real password on the placeholder account.
router.post("/set-password", asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: "Token and password are required" });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(400).json({ error: "This invite link is invalid or has expired" });
  }
  if (payload.purpose !== "invite") return res.status(400).json({ error: "Invalid token" });

  const user = await prisma.user.findUnique({ where: { id: payload.id } });
  if (!user) return res.status(404).json({ error: "Account not found" });

  const passwordHash = await bcrypt.hash(password, 10);
  const updated = await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  res.cookie("token", signToken(updated), COOKIE_OPTS);
  res.json({ id: updated.id, email: updated.email, name: updated.name, role: updated.role });
}));

module.exports = router;
module.exports.signInviteToken = signInviteToken;
