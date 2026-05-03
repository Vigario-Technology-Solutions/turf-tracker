/*
  Warnings:

  - You are about to drop the column `headType` on the `Area` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Area" DROP COLUMN "headType",
ADD COLUMN     "headTypeId" INTEGER;

-- CreateTable
CREATE TABLE "IrrigationHeadType" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "IrrigationHeadType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IrrigationHeadType_code_key" ON "IrrigationHeadType"("code");

-- AddForeignKey
ALTER TABLE "Area" ADD CONSTRAINT "Area_headTypeId_fkey" FOREIGN KEY ("headTypeId") REFERENCES "IrrigationHeadType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
