import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";

// Workers have no persistent process, so there's no module-level singleton —
// each request builds a client from that request's D1 binding (env.DB).
export function getPrisma(env) {
  const adapter = new PrismaD1(env.DB);
  return new PrismaClient({ adapter });
}
