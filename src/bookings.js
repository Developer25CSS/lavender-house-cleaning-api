import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { jwtVerify } from "jose";
import { getPrisma } from "./prisma.js";
import { requireAuth, requireRole, requireActiveStaff, secretKey } from "./middleware.js";

const app = new Hono();

// Guest bookings are allowed, but if a valid session cookie is present we
// still want to know who's booking (to link the booking to their account).
async function optionalAuth(c, next) {
  const token = getCookie(c, "token");
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secretKey(c.env));
      c.set("user", payload);
    } catch {
      // guest booking with a stale cookie is still fine
    }
  }
  await next();
}

const CLEANER_SELECT = { id: true, name: true };

app.post("/", optionalAuth, async (c) => {
  const body = await c.req.json();
  const { name, phone, email, homeSize, service, area, addons, notes, totalPrice, preferredCleanerId } = body;
  if (!name || !phone || !email || !homeSize || !service || !area) {
    return c.json({ error: "Missing required booking fields" }, 400);
  }

  const prisma = getPrisma(c.env);
  const user = c.get("user");

  let validPreferredCleanerId = null;
  if (preferredCleanerId && user) {
    // Only allow requesting a cleaner the logged-in customer has actually had before, and who is still active.
    const priorBooking = await prisma.booking.findFirst({
      where: { userId: user.id, assignedCleanerId: preferredCleanerId },
    });
    const cleaner = await prisma.user.findUnique({ where: { id: preferredCleanerId } });
    if (priorBooking && cleaner && cleaner.employmentStatus === "ACTIVE") {
      validPreferredCleanerId = preferredCleanerId;
    }
  }

  const booking = await prisma.booking.create({
    data: {
      userId: user ? user.id : null,
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

  return c.json(booking, 201);
});

app.get("/", requireAuth, requireActiveStaff, async (c) => {
  const prisma = getPrisma(c.env);
  const user = c.get("user");
  const isStaff = user.role === "STAFF" || user.role === "ADMIN";
  const bookings = await prisma.booking.findMany({
    where: isStaff ? {} : { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      assignedCleaner: { select: CLEANER_SELECT },
      preferredCleaner: { select: CLEANER_SELECT },
      review: true,
    },
  });
  return c.json(bookings);
});

app.patch("/:id", requireAuth, requireRole("STAFF", "ADMIN"), requireActiveStaff, async (c) => {
  const { status } = await c.req.json();
  const allowed = ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED"];
  if (!allowed.includes(status)) {
    return c.json({ error: "status must be one of " + allowed.join(", ") }, 400);
  }

  const prisma = getPrisma(c.env);
  try {
    const booking = await prisma.booking.update({
      where: { id: c.req.param("id") },
      data: { status },
    });
    return c.json(booking);
  } catch {
    return c.json({ error: "Booking not found" }, 404);
  }
});

app.patch("/:id/assign-cleaner", requireAuth, requireRole("STAFF", "ADMIN"), requireActiveStaff, async (c) => {
  const { cleanerId } = await c.req.json();
  const prisma = getPrisma(c.env);

  if (cleanerId) {
    const cleaner = await prisma.user.findUnique({ where: { id: cleanerId } });
    if (!cleaner || !["STAFF", "ADMIN"].includes(cleaner.role) || cleaner.employmentStatus !== "ACTIVE") {
      return c.json({ error: "cleanerId must be an active staff member" }, 400);
    }
  }

  try {
    const booking = await prisma.booking.update({
      where: { id: c.req.param("id") },
      data: { assignedCleanerId: cleanerId || null },
      include: { assignedCleaner: { select: CLEANER_SELECT } },
    });
    return c.json(booking);
  } catch {
    return c.json({ error: "Booking not found" }, 404);
  }
});

export default app;
