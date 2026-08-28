import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { getPrisma } from "./prisma.js";
import { requireAuth, requireActiveStaff, secretKey } from "./middleware.js";

const app = new Hono();

function cookieOpts() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "None",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  };
}

async function signToken(env, user) {
  return new SignJWT({ id: user.id, email: user.email, name: user.name, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey(env));
}

// Used by the applicant-hiring flow to hand a new hire a one-time link to set
// their own password, instead of the owner needing to run seed-staff per hire.
export async function signInviteToken(env, userId) {
  return new SignJWT({ id: userId, purpose: "invite" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey(env));
}

app.post("/signup", async (c) => {
  const { email, password, name, phone } = await c.req.json();
  if (!email || !password || !name) {
    return c.json({ error: "Name, email and password are required" }, 400);
  }
  if (password.length < 8) {
    return c.json({ error: "Password must be at least 8 characters" }, 400);
  }

  const prisma = getPrisma(c.env);
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) return c.json({ error: "An account with that email already exists" }, 409);

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email: email.toLowerCase(), passwordHash, name, phone },
  });

  setCookie(c, "token", await signToken(c.env, user), cookieOpts());
  return c.json({ id: user.id, email: user.email, name: user.name, role: user.role }, 201);
});

app.post("/login", async (c) => {
  const { email, password } = await c.req.json();
  if (!email || !password) return c.json({ error: "Email and password are required" }, 400);

  const prisma = getPrisma(c.env);
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  setCookie(c, "token", await signToken(c.env, user), cookieOpts());
  return c.json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

app.post("/logout", (c) => {
  deleteCookie(c, "token", { path: "/" });
  return c.body(null, 204);
});

app.get("/me", requireAuth, requireActiveStaff, (c) => {
  // requireActiveStaff replaces the context user with the full DB record
  // (needed elsewhere for authorization checks) — never return that
  // directly, it includes passwordHash. Whitelist what the client gets.
  const user = c.get("user");
  return c.json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

// Consumes an invite token (issued when staff marks an applicant HIRED) so a
// new hire can set their own real password on the placeholder account.
app.post("/set-password", async (c) => {
  const { token, password } = await c.req.json();
  if (!token || !password) return c.json({ error: "Token and password are required" }, 400);
  if (password.length < 8) return c.json({ error: "Password must be at least 8 characters" }, 400);

  let payload;
  try {
    ({ payload } = await jwtVerify(token, secretKey(c.env)));
  } catch {
    return c.json({ error: "This invite link is invalid or has expired" }, 400);
  }
  if (payload.purpose !== "invite") return c.json({ error: "Invalid token" }, 400);

  const prisma = getPrisma(c.env);
  const user = await prisma.user.findUnique({ where: { id: payload.id } });
  if (!user) return c.json({ error: "Account not found" }, 404);

  const passwordHash = await bcrypt.hash(password, 10);
  const updated = await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  setCookie(c, "token", await signToken(c.env, updated), cookieOpts());
  return c.json({ id: updated.id, email: updated.email, name: updated.name, role: updated.role });
});

export default app;
