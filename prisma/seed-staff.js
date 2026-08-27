require("dotenv").config();
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function arg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

async function main() {
  const name = arg("name");
  const email = arg("email");
  const password = arg("password");
  const role = (arg("role") || "staff").toUpperCase() === "ADMIN" ? "ADMIN" : "STAFF";

  if (!name || !email || !password) {
    console.error(
      "Usage: npm run seed:staff -- --name=\"Jane Doe\" --email=jane@example.com --password=secret123 --role=staff"
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: { passwordHash, name, role },
    create: { email: email.toLowerCase(), passwordHash, name, role },
  });

  console.log(`${role} account ready: ${user.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
