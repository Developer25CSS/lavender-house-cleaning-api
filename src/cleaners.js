const express = require("express");
const prisma = require("./prisma");
const { requireAuth, requireRole, requireActiveStaff } = require("./middleware");
const asyncHandler = require("./asyncHandler");

const router = express.Router();

const MIN_REVIEWS_TO_FLAG = 3;

router.use(requireAuth, requireRole("STAFF", "ADMIN"), requireActiveStaff);

router.get("/", asyncHandler(async (req, res) => {
  const cleaners = await prisma.user.findMany({
    where: { role: { in: ["STAFF", "ADMIN"] } },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      payTrack: true,
      employmentStatus: true,
      reviewsReceived: { select: { rating: true } },
      disciplineReceived: { orderBy: { createdAt: "desc" }, include: { issuedBy: { select: { name: true } } } },
    },
  });

  const withRating = cleaners.map((c) => {
    const count = c.reviewsReceived.length;
    const avg = count ? c.reviewsReceived.reduce((sum, r) => sum + r.rating, 0) / count : null;
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      role: c.role,
      payTrack: c.payTrack,
      employmentStatus: c.employmentStatus,
      reviewCount: count,
      avgRating: avg,
      flagged: avg !== null && count >= MIN_REVIEWS_TO_FLAG && avg < 4.0,
      discipline: c.disciplineReceived,
    };
  });

  res.json(withRating);
}));

// Discipline notes and status changes are ADMIN-only, deliberately: letting
// cleaners log notes about peers invites retaliation with no oversight.
router.post("/:id/discipline", requireRole("ADMIN"), asyncHandler(async (req, res) => {
  const { note } = req.body;
  if (!note) return res.status(400).json({ error: "note is required" });

  const cleaner = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!cleaner || !["STAFF", "ADMIN"].includes(cleaner.role)) {
    return res.status(404).json({ error: "Cleaner not found" });
  }

  const created = await prisma.disciplineNote.create({
    data: { cleanerId: cleaner.id, issuedById: req.user.id, note },
  });
  res.status(201).json(created);
}));

router.patch("/:id/status", requireRole("ADMIN"), asyncHandler(async (req, res) => {
  const { employmentStatus } = req.body;
  if (!["ACTIVE", "WARNED", "TERMINATED"].includes(employmentStatus)) {
    return res.status(400).json({ error: "employmentStatus must be ACTIVE, WARNED, or TERMINATED" });
  }

  try {
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { employmentStatus },
    });
    res.json({ id: updated.id, employmentStatus: updated.employmentStatus });
  } catch {
    res.status(404).json({ error: "Cleaner not found" });
  }
}));

module.exports = router;
