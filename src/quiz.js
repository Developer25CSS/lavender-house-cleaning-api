import { Hono } from "hono";
import { getPrisma } from "./prisma.js";

const app = new Hono();

const PASS_THRESHOLD = 0.8; // 24/30

// Simple in-memory per-IP rate limit for the public apply endpoint.
// Fine at this app's scale — Workers isolates are short-lived, but the
// low-effort win here is stopping the same rapid-fire client, not building
// a distributed limiter.
const attempts = new Map(); // ip -> timestamps[]
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 5;

function rateLimit(c, next) {
  const ip = c.req.header("CF-Connecting-IP") || "unknown";
  const now = Date.now();
  const recent = (attempts.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    return c.json({ error: "Too many attempts. Try again later." }, 429);
  }
  recent.push(now);
  attempts.set(ip, recent);
  return next();
}

app.get("/quiz", async (c) => {
  const prisma = getPrisma(c.env);
  const questions = await prisma.quizQuestion.findMany({
    orderBy: { order: "asc" },
    select: { id: true, text: true, choices: true, category: true },
  });
  return c.json(questions.map((q) => ({ ...q, choices: JSON.parse(q.choices) })));
});

app.post("/apply", rateLimit, async (c) => {
  const { name, email, phone, payTrack, answers, website } = await c.req.json();

  // Honeypot: real applicants never fill in this hidden field.
  if (website) return c.json({ error: "Invalid submission" }, 400);

  if (!name || !email || !phone || !["OWN_SUPPLIES", "COMPANY_SUPPLIES"].includes(payTrack) || !Array.isArray(answers)) {
    return c.json({ error: "Missing or invalid application fields" }, 400);
  }

  const prisma = getPrisma(c.env);
  const existing = await prisma.applicant.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    return c.json({ error: "An application from this email already exists" }, 409);
  }

  const questions = await prisma.quizQuestion.findMany({ orderBy: { order: "asc" } });
  if (answers.length !== questions.length) {
    return c.json({ error: `Expected ${questions.length} answers` }, 400);
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
      answers: JSON.stringify(answers),
      quizScore,
      quizPassed,
    },
  });

  // Only pass/fail goes back to the client — returning the score turns this
  // into an oracle an applicant could use to extract the answer key by
  // flipping one answer at a time across repeated attempts.
  return c.json({ passed: quizPassed }, 201);
});

export default app;
