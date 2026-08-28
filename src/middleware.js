import { getCookie } from "hono/cookie";
import { jwtVerify } from "jose";
import { getPrisma } from "./prisma.js";

export function secretKey(env) {
  return new TextEncoder().encode(env.JWT_SECRET);
}

export async function requireAuth(c, next) {
  const token = getCookie(c, "token");
  if (!token) return c.json({ error: "Not logged in" }, 401);
  try {
    const { payload } = await jwtVerify(token, secretKey(c.env));
    c.set("user", payload);
    await next();
  } catch {
    return c.json({ error: "Invalid or expired session" }, 401);
  }
}

export function requireRole(...roles) {
  return async (c, next) => {
    const user = c.get("user");
    if (!roles.includes(user.role)) {
      return c.json({ error: "Not allowed" }, 403);
    }
    await next();
  };
}

// Re-checks the DB so a just-terminated cleaner's still-valid JWT cookie
// can't keep them logged in for up to 30 days after being fired.
export async function requireActiveStaff(c, next) {
  const prisma = getPrisma(c.env);
  const jwtUser = c.get("user");
  const user = await prisma.user.findUnique({ where: { id: jwtUser.id } });
  if (!user || user.employmentStatus === "TERMINATED") {
    return c.json({ error: "Account no longer active" }, 403);
  }
  c.set("user", user);
  await next();
}
