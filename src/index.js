import { Hono } from "hono";
import { cors } from "hono/cors";

import authRoutes, { signInviteToken } from "./auth.js";
import bookingRoutes from "./bookings.js";
import quizRoutes from "./quiz.js";
import applicantRoutes from "./applicants.js";
import cleanerRoutes from "./cleaners.js";
import reviewRoutes from "./reviews.js";
import reportRoutes from "./reports.js";

const app = new Hono();

app.use("*", async (c, next) => {
  const allowedOrigins = (c.env.CORS_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
  return cors({
    origin: allowedOrigins.length ? allowedOrigins : "*",
    credentials: true,
  })(c, next);
});

app.get("/health", (c) => c.json({ ok: true }));
app.route("/api/auth", authRoutes);
app.route("/api/bookings", bookingRoutes);
app.route("/api", quizRoutes);
app.route("/api/staff/applicants", applicantRoutes);
app.route("/api/staff/cleaners", cleanerRoutes);
app.route("/api/reviews", reviewRoutes);
app.route("/api/staff/reports", reportRoutes);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Server error" }, 500);
});

export default app;
