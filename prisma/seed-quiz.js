/*
 * STARTER CONTENT — not the owner's real proprietary test.
 * These 30 questions are placeholders so the hiring quiz is immediately
 * functional and testable. Review and rewrite them before using this for
 * real hiring decisions.
 *
 * Generates prisma/seed-quiz.sql, then applies it to D1 directly (Prisma
 * Client can't reach a D1 binding outside a Workers runtime, so this writes
 * plain SQL and runs it via `wrangler d1 execute`, the same way migrations
 * are applied).
 *
 * Usage: node prisma/seed-quiz.js --local   (or --remote for production)
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const crypto = require("crypto");

const GENERAL = [
  ["What's the correct order to clean a room in?", ["Floors first, then surfaces", "Top to bottom, floors last", "Whatever is fastest", "Bathroom first, always"], 1],
  ["What should you use on granite countertops to avoid etching them?", ["Vinegar", "Bleach", "A pH-neutral cleaner", "Ammonia"], 2],
  ["How do you clean a mirror or glass without leaving streaks?", ["Paper towel and water", "Microfiber cloth and glass cleaner", "Dry dusting only", "Bleach wipes"], 1],
  ["Which cleaning product should NEVER be mixed with bleach?", ["Dish soap", "Water", "Ammonia", "Baking soda"], 2],
  ["Before using a new cleaning product on a client's surface, you should:", ["Use it everywhere immediately", "Test it in a small hidden area first", "Ask a coworker", "Only use it on tile"], 1],
  ["What's the best order for dusting vs. vacuuming a room?", ["Vacuum first, dust after", "Dust first so debris falls to the floor, then vacuum", "It doesn't matter", "Only dust, skip vacuuming if short on time"], 1],
  ["What's the safest way to clean a stainless steel appliance?", ["Scrub hard against the grain", "Wipe with the grain using a soft cloth", "Use an abrasive scrubber", "Use bleach directly"], 1],
  ["Why should you change gloves between cleaning a bathroom and a kitchen?", ["Gloves wear out that fast", "To avoid cross-contaminating food areas", "It's not necessary", "To match the color scheme"], 1],
  ["A vacuum losing suction and smelling musty is a sign of:", ["Normal operation", "A full/dirty bag or filter needing changed", "Too much power", "Nothing to worry about"], 1],
  ["What's the correct way to disinfect a toilet?", ["Wipe once with a dry cloth", "Apply disinfectant, let it sit per the label's dwell time, then scrub", "Spray and immediately rinse", "Use only water"], 1],
  ["How should hard water stains generally be treated?", ["Scrape with a metal tool", "Vinegar or a descaling solution with proper dwell time", "Ignore them", "Bleach only"], 1],
  ["What should always happen to trash before you leave a home?", ["Left as-is if mostly empty", "Emptied and bags replaced", "Only emptied if overflowing", "Left for the client to handle"], 1],
  ["Color-coding microfiber cloths by room/task exists to:", ["Look organized", "Prevent cross-contamination between areas", "Make laundry easier", "It's just a preference, no real reason"], 1],
  ["When cleaning windows, which condition is best avoided if possible?", ["Cloudy weather", "Direct hot sun (causes streaking)", "Cool temperatures", "Low humidity"], 1],
  ["What should you do before moving a client's furniture to clean under it?", ["Just move it, no need to ask", "Use proper technique and be mindful of floors/client preferences", "Never move furniture under any circumstance", "Only move it if it's light"], 1],
  ["What's the safest general dilution approach for cleaning concentrates?", ["More concentrated is always better", "Follow the label's dilution ratio", "Use as little water as possible", "Dilution doesn't matter"], 1],
  ["Which surfaces are most at risk from abrasive scrubbers?", ["Ceramic tile floors", "Glass stovetops and finished stainless steel", "Concrete", "Grout"], 1],
  ["What's a good habit for mop water during a large home clean?", ["Use the same water the whole time", "Change it when it becomes visibly dirty", "Never use a mop, only cloths", "Add more soap instead of changing water"], 1],
  ["What should you check before applying any product to an unfamiliar surface (e.g., natural stone, antique wood)?", ["Nothing, all-purpose cleaner is always safe", "Whether it's safe for that specific material, and test first", "Just use more product to be thorough", "Ask the client to leave the room"], 1],
  ["Full room dusting should generally cover:", ["Only visible surfaces at eye level", "Tops, fronts, and underneath of furniture, fixtures and decor", "Only flat horizontal surfaces", "Only once a month, not every visit"], 1],
];

const SCENARIO = [
  ["You arrive and the stovetop has heavy dried, greasy buildup. Best first step?", ["Scrub immediately with a metal pad", "Apply a degreaser and let it sit before scrubbing", "Skip it, it's too much work", "Use bleach directly on it"], 1],
  ["A shower has both heavy pet hair and soap scum. What should you do first?", ["Spray cleaner directly over the hair", "Remove the pet hair before wet-cleaning so it doesn't clump", "Ignore the hair, focus on soap scum only", "Use the vacuum on the wet shower"], 1],
  ["You notice what looks like an antique or delicate rug in a room. What's correct?", ["Clean it the same as any carpet", "Use gentle methods, avoid harsh chemicals, ask the client or office if unsure", "Avoid the room entirely without saying anything", "Shampoo it aggressively to impress the client"], 1],
  ["Midway through a job you run out of the product assigned for glass surfaces. What's the right move?", ["Substitute any glass cleaner you have on you", "Contact the office before substituting an unapproved product", "Skip glass cleaning and don't mention it", "Use the bathroom cleaner instead"], 1],
  ["You spot what looks like mold in a bathroom corner. What's the correct response?", ["Scrub it out with bleach right away", "Stop, don't attempt removal, and report it to the office/client — mold needs special handling", "Cover it and move on", "Use the same cloth you're using elsewhere to wipe it"], 1],
  ["A kitchen counter has a lot of personal clutter on it. Before wiping down, you should:", ["Move everything into a pile anywhere", "Ask first, or move items neatly and keep them in place", "Throw out anything that looks like trash", "Skip the counter entirely"], 1],
  ["You accidentally break a small decorative item while dusting. What's next?", ["Hide it and hope it isn't noticed", "Report it to the client/office right away", "Throw the pieces away quietly", "Blame it on being already broken"], 1],
  ["A bedroom has an overflowing laundry basket blocking part of the floor. What's appropriate?", ["Go through the laundry to sort it", "Clean around it — don't go through a client's personal laundry — and note it if needed", "Skip the whole room", "Move it outside the home"], 1],
  ["You're running behind schedule and another client is expecting you soon. What should you do?", ["Rush and skip checklist items to catch up", "Contact the office to communicate the delay rather than cutting corners", "Just show up late with no notice", "Cancel the next job without telling anyone"], 1],
  ["A client asks you to do something outside your assigned service (e.g. washing dishes that weren't booked). What's correct?", ["Just do it for free to keep them happy", "Politely explain the scope and offer to relay it to the office for an add-on", "Refuse rudely and leave", "Do it but complain to the client about it"], 1],
];

// Every question above was written with its correct answer at index 1 —
// convenient to write, but it means "always pick the 2nd option" passes the
// whole quiz. Rotate each question's choices by a varying amount so the
// correct answer lands at a different position each time.
function rotate([text, choices, correctIndex], shift) {
  const rotated = choices.map((_, i) => choices[(i - shift + choices.length) % choices.length]);
  return [text, rotated, (correctIndex + shift) % choices.length];
}

function sqlEscape(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

const rows = [
  ...GENERAL.map((q, i) => rotate(q, i % 4)).map(([text, choices, correctIndex], i) => ({
    text, choices, correctIndex, category: "GENERAL", order: i,
  })),
  ...SCENARIO.map((q, i) => rotate(q, (i + 2) % 4)).map(([text, choices, correctIndex], i) => ({
    text, choices, correctIndex, category: "SCENARIO", order: GENERAL.length + i,
  })),
];

const statements = [
  "DELETE FROM \"QuizQuestion\";",
  ...rows.map((r) => {
    const id = crypto.randomUUID();
    return `INSERT INTO "QuizQuestion" (id, text, choices, correctIndex, category, "order") VALUES (${sqlEscape(id)}, ${sqlEscape(r.text)}, ${sqlEscape(JSON.stringify(r.choices))}, ${r.correctIndex}, ${sqlEscape(r.category)}, ${r.order});`;
  }),
];

const sqlPath = path.join(__dirname, "seed-quiz.sql");
fs.writeFileSync(sqlPath, statements.join("\n"));

const target = process.argv.includes("--remote") ? "--remote" : "--local";
execSync(`npx wrangler d1 execute lavender-house-cleaning-db ${target} --file=${sqlPath}`, { stdio: "inherit" });
console.log(`Seeded ${rows.length} quiz questions (${target}).`);
console.log("Answer key (choice index per question, in order):", JSON.stringify(rows.map((r) => r.correctIndex)));
