-- Singleton Settings table — per-deployment configuration an
-- operator can change at runtime. Brand fields (appName,
-- appShortName, appOwner, logoFile) replace the env-based contract
-- that couldn't survive Next.js's build-time prerender of the
-- chrome routes.
--
-- Singleton enforcement: CHECK (id = 1) + the seed/admin write paths
-- only ever target id = 1.

CREATE TABLE "Settings" (
    "id"           INTEGER NOT NULL,
    "appName"      TEXT NOT NULL DEFAULT 'Turf Tracker',
    "appShortName" TEXT,
    "appOwner"     TEXT,
    "logoFile"     TEXT,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Settings_singleton_chk" CHECK ("id" = 1)
);

INSERT INTO "Settings" ("id", "updatedAt") VALUES (1, NOW());
