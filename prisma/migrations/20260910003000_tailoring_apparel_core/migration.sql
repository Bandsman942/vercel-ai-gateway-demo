-- Tailoring/Apparel #607: additive Manufacturing subtype domain.
-- Shared CRM, Catalog, Inventory, Sales, Procurement, HR, Time, Assets and Finance
-- remain canonical. These tables store only tailoring-specific extensions and workflow.

CREATE TABLE "EnterpriseTailoringConfiguration" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "operatingMode" TEXT NOT NULL DEFAULT 'MIXED',
  "defaultMeasurementUnit" TEXT NOT NULL DEFAULT 'CM',
  "settingsJson" JSONB,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseTailoringConfiguration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseTailoringMeasurementProfile" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "businessPartyId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "measuredByEmployeeId" TEXT,
  "notes" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseTailoringMeasurementProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseTailoringMeasurementValue" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "measurementCode" TEXT NOT NULL,
  "value" DECIMAL(10,2) NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'CM',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseTailoringMeasurementValue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseTailoringStyle" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "catalogItemId" TEXT NOT NULL,
  "garmentType" TEXT NOT NULL,
  "operatingMode" TEXT NOT NULL DEFAULT 'MIXED',
  "patternReference" TEXT,
  "patternVersion" INTEGER NOT NULL DEFAULT 1,
  "bomId" TEXT,
  "routingId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseTailoringStyle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseTailoringSizeGrade" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "styleId" TEXT NOT NULL,
  "sizeCode" TEXT NOT NULL,
  "baseSizeCode" TEXT,
  "sequence" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseTailoringSizeGrade_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseTailoringSizeGradeRule" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "sizeGradeId" TEXT NOT NULL,
  "measurementCode" TEXT NOT NULL,
  "deltaValue" DECIMAL(10,2) NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'CM',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseTailoringSizeGradeRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseTailoringMaterialProfile" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "catalogItemId" TEXT NOT NULL,
  "profileType" TEXT NOT NULL,
  "fabricWidthCm" DECIMAL(10,2),
  "usableWidthCm" DECIMAL(10,2),
  "shrinkageRate" DECIMAL(8,4),
  "grainDirection" TEXT,
  "colorFamily" TEXT,
  "notes" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseTailoringMaterialProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseTailoringCuttingPlan" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "productionOrderId" TEXT NOT NULL,
  "styleId" TEXT,
  "materialRequirementId" TEXT,
  "fabricCatalogItemId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "fabricWidthCm" DECIMAL(10,2),
  "markerLengthCm" DECIMAL(10,2),
  "layers" INTEGER NOT NULL DEFAULT 1,
  "plannedQuantity" DECIMAL(18,3) NOT NULL,
  "cutQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "wasteQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
  "markerEfficiency" DECIMAL(8,4),
  "notes" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "EnterpriseTailoringCuttingPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseTailoringFitting" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "productionOrderId" TEXT NOT NULL,
  "measurementProfileId" TEXT,
  "sequence" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "result" TEXT NOT NULL DEFAULT 'PENDING',
  "scheduledAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "fittedByEmployeeId" TEXT,
  "notes" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseTailoringFitting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseTailoringAlteration" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "fittingId" TEXT NOT NULL,
  "productionOrderId" TEXT NOT NULL,
  "alterationType" TEXT NOT NULL,
  "areaCode" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "assignedEmployeeId" TEXT,
  "dueAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseTailoringAlteration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseTailoringGarmentBundle" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "bundleCode" TEXT NOT NULL,
  "productionOrderId" TEXT NOT NULL,
  "cuttingPlanId" TEXT,
  "sizeCode" TEXT,
  "quantity" DECIMAL(18,3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CUT',
  "currentWorkCenterId" TEXT,
  "notes" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseTailoringGarmentBundle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnterpriseTailoringFinishingRecord" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "productionOrderId" TEXT NOT NULL,
  "garmentBundleId" TEXT NOT NULL,
  "qualityCheckId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "pressed" BOOLEAN NOT NULL DEFAULT false,
  "threadTrimmed" BOOLEAN NOT NULL DEFAULT false,
  "fasteningsChecked" BOOLEAN NOT NULL DEFAULT false,
  "packaged" BOOLEAN NOT NULL DEFAULT false,
  "completedByEmployeeId" TEXT,
  "completedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnterpriseTailoringFinishingRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnterpriseTailoringConfiguration_organizationId_key" ON "EnterpriseTailoringConfiguration"("organizationId");
CREATE INDEX "EnterpriseTailoringConfiguration_organizationId_idx" ON "EnterpriseTailoringConfiguration"("organizationId");
CREATE UNIQUE INDEX "EnterpriseTailoringMeasurementProfile_organizationId_id_key" ON "EnterpriseTailoringMeasurementProfile"("organizationId", "id");
CREATE UNIQUE INDEX "TailoringMeasurement_org_party_version_key" ON "EnterpriseTailoringMeasurementProfile"("organizationId", "businessPartyId", "version");
CREATE INDEX "EnterpriseTailoringMeasurementProfile_org_party_status_idx" ON "EnterpriseTailoringMeasurementProfile"("organizationId", "businessPartyId", "status");
CREATE INDEX "EnterpriseTailoringMeasurementProfile_org_measuredAt_idx" ON "EnterpriseTailoringMeasurementProfile"("organizationId", "measuredAt");
CREATE INDEX "EnterpriseTailoringMeasurementProfile_archivedAt_idx" ON "EnterpriseTailoringMeasurementProfile"("archivedAt");
CREATE UNIQUE INDEX "EnterpriseTailoringMeasurementValue_organizationId_id_key" ON "EnterpriseTailoringMeasurementValue"("organizationId", "id");
CREATE UNIQUE INDEX "TailoringMeasureValue_org_profile_code_key" ON "EnterpriseTailoringMeasurementValue"("organizationId", "profileId", "measurementCode");
CREATE INDEX "EnterpriseTailoringMeasurementValue_org_code_idx" ON "EnterpriseTailoringMeasurementValue"("organizationId", "measurementCode");
CREATE UNIQUE INDEX "EnterpriseTailoringStyle_organizationId_id_key" ON "EnterpriseTailoringStyle"("organizationId", "id");
CREATE UNIQUE INDEX "TailoringStyle_org_code_pattern_version_key" ON "EnterpriseTailoringStyle"("organizationId", "code", "patternVersion");
CREATE INDEX "EnterpriseTailoringStyle_org_catalog_status_idx" ON "EnterpriseTailoringStyle"("organizationId", "catalogItemId", "status");
CREATE INDEX "EnterpriseTailoringStyle_org_bom_status_idx" ON "EnterpriseTailoringStyle"("organizationId", "bomId", "status");
CREATE INDEX "EnterpriseTailoringStyle_org_routing_status_idx" ON "EnterpriseTailoringStyle"("organizationId", "routingId", "status");
CREATE INDEX "EnterpriseTailoringStyle_archivedAt_idx" ON "EnterpriseTailoringStyle"("archivedAt");
CREATE UNIQUE INDEX "EnterpriseTailoringSizeGrade_organizationId_id_key" ON "EnterpriseTailoringSizeGrade"("organizationId", "id");
CREATE UNIQUE INDEX "TailoringSizeGrade_org_style_size_key" ON "EnterpriseTailoringSizeGrade"("organizationId", "styleId", "sizeCode");
CREATE INDEX "EnterpriseTailoringSizeGrade_org_style_sequence_idx" ON "EnterpriseTailoringSizeGrade"("organizationId", "styleId", "sequence");
CREATE UNIQUE INDEX "EnterpriseTailoringSizeGradeRule_organizationId_id_key" ON "EnterpriseTailoringSizeGradeRule"("organizationId", "id");
CREATE UNIQUE INDEX "TailoringGradeRule_org_grade_code_key" ON "EnterpriseTailoringSizeGradeRule"("organizationId", "sizeGradeId", "measurementCode");
CREATE INDEX "EnterpriseTailoringSizeGradeRule_org_code_idx" ON "EnterpriseTailoringSizeGradeRule"("organizationId", "measurementCode");
CREATE UNIQUE INDEX "EnterpriseTailoringMaterialProfile_organizationId_id_key" ON "EnterpriseTailoringMaterialProfile"("organizationId", "id");
CREATE UNIQUE INDEX "TailoringMaterial_org_catalog_key" ON "EnterpriseTailoringMaterialProfile"("organizationId", "catalogItemId");
CREATE INDEX "EnterpriseTailoringMaterialProfile_org_type_archived_idx" ON "EnterpriseTailoringMaterialProfile"("organizationId", "profileType", "archivedAt");
CREATE UNIQUE INDEX "EnterpriseTailoringCuttingPlan_organizationId_id_key" ON "EnterpriseTailoringCuttingPlan"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseTailoringCuttingPlan_organizationId_reference_key" ON "EnterpriseTailoringCuttingPlan"("organizationId", "reference");
CREATE INDEX "EnterpriseTailoringCuttingPlan_org_order_status_idx" ON "EnterpriseTailoringCuttingPlan"("organizationId", "productionOrderId", "status");
CREATE INDEX "EnterpriseTailoringCuttingPlan_org_requirement_status_idx" ON "EnterpriseTailoringCuttingPlan"("organizationId", "materialRequirementId", "status");
CREATE INDEX "EnterpriseTailoringCuttingPlan_org_fabric_status_idx" ON "EnterpriseTailoringCuttingPlan"("organizationId", "fabricCatalogItemId", "status");
CREATE UNIQUE INDEX "EnterpriseTailoringFitting_organizationId_id_key" ON "EnterpriseTailoringFitting"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseTailoringFitting_organizationId_reference_key" ON "EnterpriseTailoringFitting"("organizationId", "reference");
CREATE UNIQUE INDEX "TailoringFitting_org_order_sequence_key" ON "EnterpriseTailoringFitting"("organizationId", "productionOrderId", "sequence");
CREATE INDEX "EnterpriseTailoringFitting_org_order_status_idx" ON "EnterpriseTailoringFitting"("organizationId", "productionOrderId", "status");
CREATE INDEX "EnterpriseTailoringFitting_org_scheduled_status_idx" ON "EnterpriseTailoringFitting"("organizationId", "scheduledAt", "status");
CREATE UNIQUE INDEX "EnterpriseTailoringAlteration_organizationId_id_key" ON "EnterpriseTailoringAlteration"("organizationId", "id");
CREATE INDEX "EnterpriseTailoringAlteration_org_order_status_idx" ON "EnterpriseTailoringAlteration"("organizationId", "productionOrderId", "status");
CREATE INDEX "EnterpriseTailoringAlteration_org_employee_status_idx" ON "EnterpriseTailoringAlteration"("organizationId", "assignedEmployeeId", "status");
CREATE INDEX "EnterpriseTailoringAlteration_org_due_status_idx" ON "EnterpriseTailoringAlteration"("organizationId", "dueAt", "status");
CREATE UNIQUE INDEX "EnterpriseTailoringGarmentBundle_organizationId_id_key" ON "EnterpriseTailoringGarmentBundle"("organizationId", "id");
CREATE UNIQUE INDEX "EnterpriseTailoringGarmentBundle_organizationId_bundleCode_key" ON "EnterpriseTailoringGarmentBundle"("organizationId", "bundleCode");
CREATE INDEX "EnterpriseTailoringGarmentBundle_org_order_status_idx" ON "EnterpriseTailoringGarmentBundle"("organizationId", "productionOrderId", "status");
CREATE INDEX "EnterpriseTailoringGarmentBundle_org_workcenter_status_idx" ON "EnterpriseTailoringGarmentBundle"("organizationId", "currentWorkCenterId", "status");
CREATE UNIQUE INDEX "EnterpriseTailoringFinishingRecord_organizationId_id_key" ON "EnterpriseTailoringFinishingRecord"("organizationId", "id");
CREATE UNIQUE INDEX "TailoringFinishing_org_bundle_key" ON "EnterpriseTailoringFinishingRecord"("organizationId", "garmentBundleId");
CREATE INDEX "EnterpriseTailoringFinishingRecord_org_order_status_idx" ON "EnterpriseTailoringFinishingRecord"("organizationId", "productionOrderId", "status");
CREATE INDEX "EnterpriseTailoringFinishingRecord_org_quality_idx" ON "EnterpriseTailoringFinishingRecord"("organizationId", "qualityCheckId");

ALTER TABLE "EnterpriseTailoringMeasurementValue" ADD CONSTRAINT "TailoringMeasurementValue_profile_fkey" FOREIGN KEY ("organizationId", "profileId") REFERENCES "EnterpriseTailoringMeasurementProfile"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseTailoringSizeGrade" ADD CONSTRAINT "TailoringSizeGrade_style_fkey" FOREIGN KEY ("organizationId", "styleId") REFERENCES "EnterpriseTailoringStyle"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseTailoringSizeGradeRule" ADD CONSTRAINT "TailoringSizeGradeRule_grade_fkey" FOREIGN KEY ("organizationId", "sizeGradeId") REFERENCES "EnterpriseTailoringSizeGrade"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseTailoringCuttingPlan" ADD CONSTRAINT "TailoringCuttingPlan_style_fkey" FOREIGN KEY ("organizationId", "styleId") REFERENCES "EnterpriseTailoringStyle"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseTailoringFitting" ADD CONSTRAINT "TailoringFitting_measurement_fkey" FOREIGN KEY ("organizationId", "measurementProfileId") REFERENCES "EnterpriseTailoringMeasurementProfile"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseTailoringAlteration" ADD CONSTRAINT "TailoringAlteration_fitting_fkey" FOREIGN KEY ("organizationId", "fittingId") REFERENCES "EnterpriseTailoringFitting"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnterpriseTailoringGarmentBundle" ADD CONSTRAINT "TailoringGarmentBundle_cutting_fkey" FOREIGN KEY ("organizationId", "cuttingPlanId") REFERENCES "EnterpriseTailoringCuttingPlan"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnterpriseTailoringFinishingRecord" ADD CONSTRAINT "TailoringFinishing_bundle_fkey" FOREIGN KEY ("organizationId", "garmentBundleId") REFERENCES "EnterpriseTailoringGarmentBundle"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
