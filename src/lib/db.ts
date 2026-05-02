import { PrismaClient } from "@generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/turf_tracker";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

if (!globalForPrisma.prisma) {
  const adapter = new PrismaPg({ connectionString });
  globalForPrisma.prisma = new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma;

export default prisma;
