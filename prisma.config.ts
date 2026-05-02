import * as path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join(__dirname, "prisma", "schema.prisma"),
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/turf_tracker",
  },
  migrations: {
    seed: "npx tsx prisma/seed/index.ts",
  },
});
