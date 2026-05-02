-- CreateTable
CREATE TABLE "AreaType" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AreaType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IrrigationSource" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "IrrigationSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductForm" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProductForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationUnit" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ApplicationUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyMember" (
    "propertyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyMember_pkey" PRIMARY KEY ("propertyId","userId")
);

-- CreateTable
CREATE TABLE "Area" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "areaSqFt" INTEGER NOT NULL,
    "areaTypeId" INTEGER NOT NULL,
    "cropOrSpecies" TEXT,
    "irrigationSourceId" INTEGER NOT NULL,
    "waterNaPpm" DOUBLE PRECISION,
    "precipRateInPerHr" DOUBLE PRECISION,
    "headType" TEXT,
    "currentSoilTestId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoilTest" (
    "id" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "testDate" TIMESTAMP(3) NOT NULL,
    "lab" TEXT,
    "labReportId" TEXT,
    "pH" DOUBLE PRECISION,
    "nPpm" DOUBLE PRECISION,
    "pPpm" DOUBLE PRECISION,
    "kPpm" DOUBLE PRECISION,
    "sPpm" DOUBLE PRECISION,
    "caPpm" DOUBLE PRECISION,
    "mgPpm" DOUBLE PRECISION,
    "naPpm" DOUBLE PRECISION,
    "fePpm" DOUBLE PRECISION,
    "mnPpm" DOUBLE PRECISION,
    "znPpm" DOUBLE PRECISION,
    "cuPpm" DOUBLE PRECISION,
    "bPpm" DOUBLE PRECISION,
    "omPct" DOUBLE PRECISION,
    "cecMeq100g" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoilTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "formId" INTEGER NOT NULL,
    "nPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "p2o5Pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "k2oPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "caPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mgPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "naPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mnPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "znPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cuPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "densityLbPerGal" DOUBLE PRECISION,
    "pkgSizeValue" DOUBLE PRECISION NOT NULL,
    "pkgSizeUnit" TEXT NOT NULL,
    "pkgCostUsd" DOUBLE PRECISION NOT NULL,
    "mfgRateValue" DOUBLE PRECISION,
    "mfgRateUnit" TEXT,
    "mfgRatePer" TEXT,
    "tags" TEXT[],
    "sharedInHousehold" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedByUserId" TEXT NOT NULL,
    "amountValue" DOUBLE PRECISION NOT NULL,
    "amountUnit" TEXT NOT NULL,
    "carrierWaterGal" DOUBLE PRECISION,
    "targetNutrientLbPer1k" DOUBLE PRECISION,
    "weatherTempF" DOUBLE PRECISION,
    "weatherNotes" TEXT,
    "costUsdSnapshot" DOUBLE PRECISION NOT NULL,
    "deliveredNLb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deliveredPLb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deliveredKLb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deliveredCaLb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deliveredMgLb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deliveredSLb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deliveredFeLb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deliveredMnLb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deliveredZnLb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deliveredCuLb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deliveredBLb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deliveredNaLb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "photoUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IrrigationEvent" (
    "id" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "eventAt" TIMESTAMP(3) NOT NULL,
    "runtimeMin" INTEGER NOT NULL,
    "inchesApplied" DOUBLE PRECISION NOT NULL,
    "gallons" DOUBLE PRECISION NOT NULL,
    "naLbDeposited" DOUBLE PRECISION NOT NULL,
    "isLeachingCycle" BOOLEAN NOT NULL DEFAULT false,
    "recordedByUserId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IrrigationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" JSONB,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissedUntil" TIMESTAMP(3),

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AreaType_code_key" ON "AreaType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "IrrigationSource_code_key" ON "IrrigationSource"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ProductForm_code_key" ON "ProductForm"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationUnit_code_key" ON "ApplicationUnit"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Area_currentSoilTestId_key" ON "Area"("currentSoilTestId");

-- CreateIndex
CREATE INDEX "Area_propertyId_idx" ON "Area"("propertyId");

-- CreateIndex
CREATE INDEX "SoilTest_areaId_testDate_idx" ON "SoilTest"("areaId", "testDate");

-- CreateIndex
CREATE INDEX "Product_createdByUserId_idx" ON "Product"("createdByUserId");

-- CreateIndex
CREATE INDEX "Application_areaId_appliedAt_idx" ON "Application"("areaId", "appliedAt");

-- CreateIndex
CREATE INDEX "IrrigationEvent_areaId_eventAt_idx" ON "IrrigationEvent"("areaId", "eventAt");

-- CreateIndex
CREATE INDEX "Recommendation_areaId_idx" ON "Recommendation"("areaId");

-- CreateIndex
CREATE UNIQUE INDEX "Recommendation_areaId_ruleId_key" ON "Recommendation"("areaId", "ruleId");

-- AddForeignKey
ALTER TABLE "PropertyMember" ADD CONSTRAINT "PropertyMember_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Area" ADD CONSTRAINT "Area_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Area" ADD CONSTRAINT "Area_areaTypeId_fkey" FOREIGN KEY ("areaTypeId") REFERENCES "AreaType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Area" ADD CONSTRAINT "Area_irrigationSourceId_fkey" FOREIGN KEY ("irrigationSourceId") REFERENCES "IrrigationSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoilTest" ADD CONSTRAINT "SoilTest_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_formId_fkey" FOREIGN KEY ("formId") REFERENCES "ProductForm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IrrigationEvent" ADD CONSTRAINT "IrrigationEvent_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE CASCADE ON UPDATE CASCADE;
