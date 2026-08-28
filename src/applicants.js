const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");
const prisma = require("./prisma");
const { requireAuth, requireRole, requireActiveStaff } = require("./middleware");
const { signInviteToken } = require("./auth");
const asyncHandler = require("./asyncHandler");

const router = express.Router();

router.use(requireAuth, requireRole("STAFF", "ADMIN"), requireActiveStaff);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const applicants = await prisma.applicant.findMany({ orderBy: { createdAt: "desc" } });
    res.json(applicants);
  })
);

router.patch("/:id", asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!["HIRED", "REJECTED"].includes(status)) {
    return res.status(400).json({ error: "status must be HIRED or REJECTED" });
  }

  const applicant = await prisma.applicant.findUnique({ where: { id: req.params.id } });
  if (!applicant) return res.status(404).json({ error: "Applicant not found" });

  // The quiz is a hard gate, not just an informational column — an admin
  // cannot hire someone who failed it.
  if (status === "HIRED" && !applicant.quizPassed) {
    return res.status(400).json({ error: "This applicant did not pass the hiring quiz" });
  }

  if (status === "REJECTED") {
    const updated = await prisma.applicant.update({ where: { id: applicant.id }, data: { status } });
    return res.json(updated);
  }

  // HIRED: create the real User account with an unusable placeholder password,
  // and hand back a one-time invite token for them to set their own password.
  const existingUser = await prisma.user.findUnique({ where: { email: applicant.email } });
  if (existingUser) {
    return res.status(409).json({ error: "A user account with this email already exists" });
  }

  const placeholderHash = await bcrypt.hash(crypto.randomUUID(), 10);
  const user = await prisma.user.create({
    data: {
      email: applicant.email,
      name: applicant.name,
      phone: applicant.phone,
      passwordHash: placeholderHash,
      role: "STAFF",
      payTrack: applicant.payTrack,
      employmentStatus: "ACTIVE",
    },
  });

  const updated = await prisma.applicant.update({ where: { id: applicant.id }, data: { status } });

  res.json({ applicant: updated, inviteToken: signInviteToken(user.id) });
}));

module.exports = router;
