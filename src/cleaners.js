import { Hono } from "hono";
import { getPrisma } from "./prisma.js";
import { requireAuth, requireRole, requireActiveStaff } from "./middleware.js";

const app = new Hono();

const MIN_REVIEWS_TO_FLAG = 3;

app.use("*", requireAuth, requireRole("STAFF", "ADMIN"), requireActiveStaff);

app.get("/", async (c) => {
  const prisma = getPrisma(c.env);
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

  const withRating = cleaners.map((cl) => {
    const count = cl.reviewsReceived.length;
    const avg = count ? cl.reviewsReceived.reduce((sum, r) => sum + r.rating, 0) / count : null;
    return {
      id: cl.id,
      name: cl.name,
      email: cl.email,
      role: cl.role,
      payTrack: cl.payTrack,
      employmentStatus: cl.employmentStatus,
      reviewCount: count,
      avgRating: avg,
      flagged: avg !== null && count >= MIN_REVIEWS_TO_FLAG && avg < 4.0,
      discipline: cl.disciplineReceived,
    };
  });

  return c.json(withRating);
});

// Discipline notes and status changes are ADMIN-only, deliberately: letting
// cleaners log notes about peers invites retaliation with no oversight.
app.post("/:id/discipline", requireRole("ADMIN"), async (c) => {
  const { note } = await c.req.json();
  if (!note) return c.json({ error: "note is required" }, 400);

  const prisma = getPrisma(c.env);
  const cleaner = await prisma.user.findUnique({ where: { id: c.req.param("id") } });
  if (!cleaner || !["STAFF", "ADMIN"].includes(cleaner.role)) {
    return c.json({ error: "Cleaner not found" }, 404);
  }

  const user = c.get("user");
  const created = await prisma.disciplineNote.create({
    data: { cleanerId: cleaner.id, issuedById: user.id, note },
  });
  return c.json(created, 201);
});

app.patch("/:id/status", requireRole("ADMIN"), async (c) => {
  const { employmentStatus } = await c.req.json();
  if (!["ACTIVE", "WARNED", "TERMINATED"].includes(employmentStatus)) {
    return c.json({ error: "employmentStatus must be ACTIVE, WARNED, or TERMINATED" }, 400);
  }

  const prisma = getPrisma(c.env);
  try {
    const updated = await prisma.user.update({
      where: { id: c.req.param("id") },
      data: { employmentStatus },
    });
    return c.json({ id: updated.id, employmentStatus: updated.employmentStatus });
  } catch {
    return c.json({ error: "Cleaner not found" }, 404);
  }
});

export default app;
