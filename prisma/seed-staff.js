/*
 * Creates or updates a STAFF/ADMIN account directly in D1 via raw SQL
 * (Prisma Client can't reach a D1 binding outside a Workers runtime).
 *
 * Usage: node prisma/seed-staff.js --name="Jane Doe" --email=jane@example.com --password=secret123 --role=admin [--local|--remote]
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

function arg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

function sqlEscape(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

async function main() {
  const name = arg("name");
  const email = arg("email");
  const password = arg("password");
  const role = (arg("role") || "staff").toUpperCase() === "ADMIN" ? "ADMIN" : "STAFF";
  const target = process.argv.includes("--remote") ? "--remote" : "--local";

  if (!name || !email || !password) {
    console.error(
      'Usage: node prisma/seed-staff.js --name="Jane Doe" --email=jane@example.com --password=secret123 --role=staff [--local|--remote]'
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const id = crypto.randomUUID();
  const emailLower = email.toLowerCase();

  const sql = [
    `DELETE FROM "User" WHERE email = ${sqlEscape(emailLower)};`,
    `INSERT INTO "User" (id, email, passwordHash, name, role, employmentStatus) VALUES (${sqlEscape(id)}, ${sqlEscape(emailLower)}, ${sqlEscape(passwordHash)}, ${sqlEscape(name)}, ${sqlEscape(role)}, 'ACTIVE');`,
  ].join("\n");

  const sqlPath = path.join(__dirname, "seed-staff.sql");
  fs.writeFileSync(sqlPath, sql);

  execSync(`npx wrangler d1 execute lavender-house-cleaning-db ${target} --file=${sqlPath}`, { stdio: "inherit" });
  console.log(`${role} account ready (${target}): ${emailLower}`);
}

main();
