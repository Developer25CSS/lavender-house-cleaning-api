const express = require("express");
const prisma = require("./prisma");
const asyncHandler = require("./asyncHandler");

const router = express.Router();

const PASS_THRESHOLD = 0.8; // 24/30

// Simple in-memory per-IP rate limit for the public apply endpoint.
// Fine at this app's scale — a single Render instance, no need for Redis.
const attempts = new Map(); // ip -> timestamps[]
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 5;

function rateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const recent = (attempts.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    return res.status(429).json({ error: "Too many attempts. Try again later." });
  }
  recent.push(now);
  attempts.set(ip, recent);
  next();
}

router.get(
  "/quiz",
  asyncHandler(async (req, res) => {
    const questions = await prisma.quizQuestion.findMany({
      orderBy: { order: "asc" },
      select: { id: true, text: true, choices: true, category: true },
    });
    res.json(questions);
  })
);

router.post("/apply", rateLimit, asyncHandler(async (req, res) => {
  const { name, email, phone, payTrack, answers, website } = req.body;

  // Honeypot: real applicants never fill in this hidden field.
  if (website) return res.status(400).json({ error: "Invalid submission" });

  if (!name || !email || !phone || !["OWN_SUPPLIES", "COMPANY_SUPPLIES"].includes(payTrack) || !Array.isArray(answers)) {
    return res.status(400).json({ error: "Missing or invalid application fields" });
  }

  const existing = await prisma.applicant.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    return res.status(409).json({ error: "An application from this email already exists" });
  }

  const questions = await prisma.quizQuestion.findMany({ orderBy: { order: "asc" } });
  if (answers.length !== questions.length) {
    return res.status(400).json({ error: `Expected ${questions.length} answers` });
  }

  let correct = 0;
  questions.forEach((q, i) => {
    if (answers[i] === q.correctIndex) correct += 1;
  });
  const quizScore = correct;
  const quizPassed = correct / questions.length >= PASS_THRESHOLD;

  await prisma.applicant.create({
    data: {
      name,
      email: email.toLowerCase(),
      phone,
      payTrack,
      answers,
      quizScore,
      quizPassed,
    },
  });

  // Only pass/fail goes back to the client — returning the score turns this
  // into an oracle an applicant could use to extract the answer key by
  // flipping one answer at a time across repeated attempts.
  res.status(201).json({ passed: quizPassed });
}));

module.exports = router;
