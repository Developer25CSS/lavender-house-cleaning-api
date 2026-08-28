import { Hono } from "hono";
import bcrypt from "bcryptjs";
import { getPrisma } from "./prisma.js";
import { requireAuth, requireRole, requireActiveStaff } from "./middleware.js";
import { signInviteToken } from "./auth.js";

const app = new Hono();

app.use("*", requireAuth, requireRole("STAFF", "ADMIN"), requireActiveStaff);

app.get("/", async (c) => {
  const prisma = getPrisma(c.env);
  const applicants = await prisma.applicant.findMany({ orderBy: { createdAt: "desc" } });
  return c.json(applicants.map((a) => ({ ...a, answers: JSON.parse(a.answers) })));
});

app.patch("/:id", async (c) => {
  const { status } = await c.req.json();
  if (!["HIRED", "REJECTED"].includes(status)) {
    return c.json({ error: "status must be HIRED or REJECTED" }, 400);
  }

  const prisma = getPrisma(c.env);
  const applicant = await prisma.applicant.findUnique({ where: { id: c.req.param("id") } });
  if (!applicant) return c.json({ error: "Applicant not found" }, 404);

  // The quiz is a hard gate, not just an informational column — an admin
  // cannot hire someone who failed it.
  if (status === "HIRED" && !applicant.quizPassed) {
    return c.json({ error: "This applicant did not pass the hiring quiz" }, 400);
  }

  if (status === "REJECTED") {
    const updated = await prisma.applicant.update({ where: { id: applicant.id }, data: { status } });
    return c.json({ ...updated, answers: JSON.parse(updated.answers) });
  }

  // HIRED: create the real User account with an unusable placeholder password,
  // and hand back a one-time invite token for them to set their own password.
  const existingUser = await prisma.user.findUnique({ where: { email: applicant.email } });
  if (existingUser) {
    return c.json({ error: "A user account with this email already exists" }, 409);
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

  return c.json({
    applicant: { ...updated, answers: JSON.parse(updated.answers) },
    inviteToken: await signInviteToken(c.env, user.id),
  });
});

export default app;
