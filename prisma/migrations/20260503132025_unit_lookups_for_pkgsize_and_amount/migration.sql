/*
  Warnings:

  - You are about to drop the column `amountUnit` on the `Application` table. All the data in the column will be lost.
  - You are about to drop the column `pkgSizeUnit` on the `Product` table. All the data in the column will be lost.
  - Added the required column `amountUnitId` to the `Application` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pkgSizeUnitId` to the `Product` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Application" DROP COLUMN "amountUnit",
ADD COLUMN     "amountUnitId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "pkgSizeUnit",
ADD COLUMN     "pkgSizeUnitId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_pkgSizeUnitId_fkey" FOREIGN KEY ("pkgSizeUnitId") REFERENCES "ApplicationUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_amountUnitId_fkey" FOREIGN KEY ("amountUnitId") REFERENCES "ApplicationUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
