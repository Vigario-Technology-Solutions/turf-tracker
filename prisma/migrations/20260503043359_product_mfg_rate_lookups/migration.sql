/*
  Warnings:

  - You are about to drop the column `mfgRatePer` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `mfgRateUnit` on the `Product` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Product" DROP COLUMN "mfgRatePer",
DROP COLUMN "mfgRateUnit",
ADD COLUMN     "mfgRateBasisId" INTEGER,
ADD COLUMN     "mfgRateUnitId" INTEGER;

-- CreateTable
CREATE TABLE "MfgRateBasis" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MfgRateBasis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MfgRateBasis_code_key" ON "MfgRateBasis"("code");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_mfgRateUnitId_fkey" FOREIGN KEY ("mfgRateUnitId") REFERENCES "ApplicationUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_mfgRateBasisId_fkey" FOREIGN KEY ("mfgRateBasisId") REFERENCES "MfgRateBasis"("id") ON DELETE SET NULL ON UPDATE CASCADE;
