const express = require("express");
const prisma = require("./prisma");
const { requireAuth, requireRole, requireActiveStaff } = require("./middleware");
const asyncHandler = require("./asyncHandler");

const router = express.Router();

function optionalAuth(req, res, next) {
  const jwt = require("jsonwebtoken");
  const token = req.cookies.token;
  if (token) {
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      // guest booking with a stale cookie is still fine
    }
  }
  next();
}

const CLEANER_SELECT = { id: true, name: true };

router.post(
  "/",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { name, phone, email, homeSize, service, area, addons, notes, totalPrice, preferredCleanerId } = req.body;
    if (!name || !phone || !email || !homeSize || !service || !area) {
      return res.status(400).json({ error: "Missing required booking fields" });
    }

    let validPreferredCleanerId = null;
    if (preferredCleanerId && req.user) {
      // Only allow requesting a cleaner the logged-in customer has actually had before, and who is still active.
      const priorBooking = await prisma.booking.findFirst({
        where: { userId: req.user.id, assignedCleanerId: preferredCleanerId },
      });
      const cleaner = await prisma.user.findUnique({ where: { id: preferredCleanerId } });
      if (priorBooking && cleaner && cleaner.employmentStatus === "ACTIVE") {
        validPreferredCleanerId = preferredCleanerId;
      }
    }

    const booking = await prisma.booking.create({
      data: {
        userId: req.user ? req.user.id : null,
        name,
        phone,
        email,
        homeSize,
        service,
        area,
        addons: addons || null,
        notes: notes || null,
        totalPrice: totalPrice != null ? Number(totalPrice) : null,
        preferredCleanerId: validPreferredCleanerId,
      },
    });

    res.status(201).json(booking);
  })
);

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const isStaff = req.user.role === "STAFF" || req.user.role === "ADMIN";
    const bookings = await prisma.booking.findMany({
      where: isStaff ? {} : { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      include: {
        assignedCleaner: { select: CLEANER_SELECT },
        preferredCleaner: { select: CLEANER_SELECT },
        review: true,
      },
    });
    res.json(bookings);
  })
);

router.patch(
  "/:id",
  requireAuth,
  requireRole("STAFF", "ADMIN"),
  requireActiveStaff,
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    const allowed = ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "status must be one of " + allowed.join(", ") });
    }

    try {
      const booking = await prisma.booking.update({
        where: { id: req.params.id },
        data: { status },
      });
      res.json(booking);
    } catch {
      res.status(404).json({ error: "Booking not found" });
    }
  })
);

router.patch(
  "/:id/assign-cleaner",
  requireAuth,
  requireRole("STAFF", "ADMIN"),
  requireActiveStaff,
  asyncHandler(async (req, res) => {
    const { cleanerId } = req.body;

    if (cleanerId) {
      const cleaner = await prisma.user.findUnique({ where: { id: cleanerId } });
      if (!cleaner || !["STAFF", "ADMIN"].includes(cleaner.role) || cleaner.employmentStatus !== "ACTIVE") {
        return res.status(400).json({ error: "cleanerId must be an active staff member" });
      }
    }

    try {
      const booking = await prisma.booking.update({
        where: { id: req.params.id },
        data: { assignedCleanerId: cleanerId || null },
        include: { assignedCleaner: { select: CLEANER_SELECT } },
      });
      res.json(booking);
    } catch {
      res.status(404).json({ error: "Booking not found" });
    }
  })
);

module.exports = router;
