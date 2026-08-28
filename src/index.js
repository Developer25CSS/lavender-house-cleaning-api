require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const authRoutes = require("./auth");
const bookingRoutes = require("./bookings");
const quizRoutes = require("./quiz");
const applicantRoutes = require("./applicants");
const cleanerRoutes = require("./cleaners");
const reviewRoutes = require("./reviews");

const app = express();
app.set("trust proxy", 1); // Render sits behind a proxy — needed so req.ip (used for rate limiting) is the real client IP, not the proxy's

const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api", quizRoutes);
app.use("/api/staff/applicants", applicantRoutes);
app.use("/api/staff/cleaners", cleanerRoutes);
app.use("/api/reviews", reviewRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API listening on :${port}`));
