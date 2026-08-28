const jwt = require("jsonwebtoken");
const prisma = require("./prisma");
const asyncHandler = require("./asyncHandler");

function requireAuth(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: "Not logged in" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Not allowed" });
    }
    next();
  };
}

// Re-checks the DB so a just-terminated cleaner's still-valid JWT cookie
// can't keep them logged in for up to 30 days after being fired.
const requireActiveStaff = asyncHandler(async (req, res, next) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user || user.employmentStatus === "TERMINATED") {
    return res.status(403).json({ error: "Account no longer active" });
  }
  req.user = user;
  next();
});

module.exports = { requireAuth, requireRole, requireActiveStaff };
