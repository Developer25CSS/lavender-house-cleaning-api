const express = require("express");
const prisma = require("./prisma");
const { requireAuth } = require("./middleware");
const asyncHandler = require("./asyncHandler");

const router = express.Router();

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const { bookingId, rating, comment } = req.body;
  const ratingNum = Number(rating);
  if (!bookingId || !Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return res.status(400).json({ error: "bookingId and an integer rating 1-5 are required" });
  }

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.userId !== req.user.id) {
    return res.status(404).json({ error: "Booking not found" });
  }
  if (booking.status !== "COMPLETED") {
    return res.status(400).json({ error: "You can only review a completed booking" });
  }
  if (!booking.assignedCleanerId) {
    return res.status(400).json({ error: "This booking has no assigned cleaner to review" });
  }

  try {
    const review = await prisma.review.create({
      data: {
        bookingId: booking.id,
        cleanerId: booking.assignedCleanerId,
        rating: ratingNum,
        comment: comment || null,
      },
    });
    res.status(201).json(review);
  } catch {
    res.status(409).json({ error: "You already reviewed this booking" });
  }
}));

module.exports = router;
