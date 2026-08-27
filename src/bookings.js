const express = require("express");
const prisma = require("./prisma");
const { requireAuth, requireRole } = require("./middleware");

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

router.post("/", optionalAuth, async (req, res) => {
  const { name, phone, email, homeSize, service, area, addons, notes, totalPrice } = req.body;
  if (!name || !phone || !email || !homeSize || !service || !area) {
    return res.status(400).json({ error: "Missing required booking fields" });
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
    },
  });

  res.status(201).json(booking);
});

router.get("/", requireAuth, async (req, res) => {
  const isStaff = req.user.role === "STAFF" || req.user.role === "ADMIN";
  const bookings = await prisma.booking.findMany({
    where: isStaff ? {} : { userId: req.user.id },
    orderBy: { createdAt: "desc" },
  });
  res.json(bookings);
});

router.patch("/:id", requireAuth, requireRole("STAFF", "ADMIN"), async (req, res) => {
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
});

module.exports = router;
