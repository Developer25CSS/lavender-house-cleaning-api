import { Hono } from "hono";
import { getPrisma } from "./prisma.js";
import { requireAuth } from "./middleware.js";

const app = new Hono();

app.post("/", requireAuth, async (c) => {
  const { bookingId, rating, comment } = await c.req.json();
  const ratingNum = Number(rating);
  if (!bookingId || !Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return c.json({ error: "bookingId and an integer rating 1-5 are required" }, 400);
  }

  const prisma = getPrisma(c.env);
  const user = c.get("user");
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.userId !== user.id) {
    return c.json({ error: "Booking not found" }, 404);
  }
  if (booking.status !== "COMPLETED") {
    return c.json({ error: "You can only review a completed booking" }, 400);
  }
  if (!booking.assignedCleanerId) {
    return c.json({ error: "This booking has no assigned cleaner to review" }, 400);
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
    return c.json(review, 201);
  } catch {
    return c.json({ error: "You already reviewed this booking" }, 409);
  }
});

export default app;
