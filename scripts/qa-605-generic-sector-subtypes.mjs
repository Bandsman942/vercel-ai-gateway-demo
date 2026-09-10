import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

const genericRegistry = read("lib/enterprise/business-subtype-registry.ts");
const subtypeSelection = read("lib/enterprise/business-subtype-selection.ts");
const subtypeModel = read("prisma/enterprise-business-subtypes.prisma");
const subtypeMigration = read("prisma/migrations/20260909002000_generic_business_subtype_selection/migration.sql");
const retailRegistry = read("lib/enterprise/retail/subtype-registry.ts");
const canonicalTemplateApplication = read("lib/enterprise/sector-template-application.ts");
const sectorTemplateRoute = read("app/api/admin/sector-templates/route.ts");
const createOrganizationRoute = read("app/api/admin/client-organizations/route.ts");
const updateOrganizationRoute = read("app/api/admin/client-organizations/[id]/route.ts");
const createPanel = read("components/admin/client-organizations-panel.tsx");
const clientCopy = read("lib/console/client-organizations-i18n.ts");
const regression = read("scripts/qa-regression-checks.mjs");
const architectureDoc = read("docs/ERP_SECTOR_SUBTYPE_ARCHITECTURE.md");

check(
  genericRegistry.includes('sectorCode: "COMMERCE_RETAIL"') && genericRegistry.includes('code: "SHOP"'),
  "Generic subtype registry must own COMMERCE_RETAIL -> SHOP classification metadata",
);
check(
  genericRegistry.includes('sectorCode: "MANUFACTURING"') && genericRegistry.includes('code: "TAILORING_APPAREL"'),
  "Generic subtype registry must declare MANUFACTURING -> TAILORING_APPAREL",
);
check(
  genericRegistry.includes('code: "TAILORING_APPAREL"') && genericRegistry.includes('implementationStatus: "ACTIVE"'),
  "TAILORING_APPAREL must be ACTIVE only after the dedicated Manufacturing/Couture implementation is delivered",
);
check(
  genericRegistry.includes("listBusinessSubtypesForSector") && genericRegistry.includes("getBusinessSubtypeForSector"),
  "Generic registry must expose sector-scoped subtype resolution",
);
check(
  subtypeModel.includes("model EnterpriseBusinessSubtypeSelection") &&
    subtypeModel.includes("organizationId      String   @unique") &&
    subtypeModel.includes("businessSubtypeCode String?"),
  "Prisma must persist one optional generic subtype selection per organization",
);
check(
  subtypeSelection.includes("persistBusinessSubtypeSelection") &&
    subtypeSelection.includes("getBusinessSubtypeSelection") &&
    subtypeSelection.includes("BUSINESS_SUBTYPE_ORGANIZATION_SECTOR_MISMATCH"),
  "Subtype selection service must validate organization/sector and expose canonical reads/writes",
);
check(
  subtypeSelection.includes("BusinessSubtypeSelectionDb") && subtypeSelection.includes("db.enterpriseBusinessSubtypeSelection.upsert"),
  "Subtype persistence must support the caller transaction for atomic sector/classification updates",
);
check(
  subtypeSelection.includes("getRetailBusinessProfile") && subtypeSelection.includes("RETAIL_COMPATIBILITY"),
  "Generic subtype selection read must preserve historical Retail compatibility during cutover",
);
check(
  subtypeMigration.includes('CREATE TABLE "EnterpriseBusinessSubtypeSelection"') &&
    subtypeMigration.includes("businessSubtypeSelectionVersion") &&
    subtypeMigration.includes("ELSE 'SHOP'") &&
    subtypeMigration.includes("ON CONFLICT (\"organizationId\") DO NOTHING"),
  "Additive migration must backfill explicit/general Retail and legacy Shop idempotently",
);
check(
  !subtypeMigration.includes("DROP TABLE") && !subtypeMigration.includes("DROP COLUMN"),
  "Subtype migration must remain additive",
);
check(
  retailRegistry.includes('@/lib/enterprise/business-subtype-registry'),
  "Retail subtype adapter must consume the generic subtype registry",
);
check(
  retailRegistry.includes("RETAIL_MODULE_CODES"),
  "Retail must retain ownership of Shop module scope",
);
check(
  retailRegistry.includes('RETAIL_BUSINESS_SUBTYPE_CODES = ["SHOP"]'),
  "Retail compatibility contract must remain SHOP-only",
);
check(
  !retailRegistry.includes("tailoring workshop"),
  "Tailoring must not be documented as a Retail subtype",
);
check(
  canonicalTemplateApplication.includes("type BusinessSubtypeCode") && canonicalTemplateApplication.includes("getBusinessSubtypeForSector"),
  "Canonical template application must accept and validate the generic subtype contract",
);
check(
  canonicalTemplateApplication.includes("getBusinessSubtypeSelection") && canonicalTemplateApplication.includes("persistBusinessSubtypeSelection"),
  "Canonical template application must reuse persisted generic classification",
);
check(
  canonicalTemplateApplication.includes("normalizeRetailBusinessSubtypeCode"),
  "Canonical template application must keep Retail behind a compatibility adapter during cutover",
);
check(
  canonicalTemplateApplication.includes("BUSINESS_SUBTYPE_INVALID_OR_SECTOR_MISMATCH"),
  "Canonical template application must fail closed for an invalid sector/subtype pair",
);
check(
  sectorTemplateRoute.includes("getBusinessSubtypeForSector") && sectorTemplateRoute.includes("listBusinessSubtypesForSector"),
  "Administration template preview must resolve subtype metadata through the generic registry",
);
check(
  sectorTemplateRoute.includes("BUSINESS_SUBTYPE_INVALID_OR_SECTOR_MISMATCH"),
  "Administration template preview must reject an invalid sector/subtype pair with a generic reason code",
);
check(
  sectorTemplateRoute.includes("businessSubtypes") && sectorTemplateRoute.includes("businessSubtype: businessSubtype"),
  "Administration template preview must expose active subtype options and generic selected subtype metadata",
);
check(
  !sectorTemplateRoute.includes("getRetailBusinessSubtype"),
  "Administration template preview must not validate classification through the Retail-only registry",
);
check(
  createOrganizationRoute.includes("getBusinessSubtypeForSector") && createOrganizationRoute.includes("normalizeBusinessSubtypeCode"),
  "Company creation must validate the selected subtype through the generic registry",
);
check(
  createOrganizationRoute.includes("persistBusinessSubtypeSelection") && createOrganizationRoute.includes('source: "DTSC_ADMIN"'),
  "Company creation must persist classification even when template application is deferred",
);
check(
  createOrganizationRoute.includes("BUSINESS_SUBTYPE_INVALID_OR_SECTOR_MISMATCH"),
  "Company creation must expose a generic invalid sector/subtype reason code",
);
check(
  createOrganizationRoute.includes("RETAIL_BUSINESS_SUBTYPE_INVALID") && createOrganizationRoute.includes("RETAIL_BUSINESS_SUBTYPE_SECTOR_MISMATCH"),
  "Company creation must preserve Retail reason-code compatibility during the cutover",
);
check(
  createOrganizationRoute.includes("syncRetailOnboardingProvisioning") && createOrganizationRoute.includes("retailBusinessSubtypeCode"),
  "Retail provisioning must remain behind its compatibility mirror during the generic cutover",
);
check(
  updateOrganizationRoute.includes("sectorChanged") &&
    updateOrganizationRoute.includes("persistBusinessSubtypeSelection") &&
    updateOrganizationRoute.includes("businessSubtypeCode: null") &&
    updateOrganizationRoute.includes("}, tx)"),
  "Changing an existing company sector must atomically reset a stale subtype selection",
);
check(
  updateOrganizationRoute.includes("subtypeReset: sectorChanged"),
  "Sector-change audit must record whether the subtype classification was reset",
);
check(
  createPanel.includes("businessSubtypeOptions") && createPanel.includes("selectedBusinessSubtypeCode"),
  "Administration DTSC must keep generic subtype state driven by the selected sector",
);
check(
  createPanel.includes('name="businessSubtypeCode"') && createPanel.includes("body?.businessSubtypes"),
  "Administration DTSC must populate the subtype combobox from the template API",
);
check(
  !createPanel.includes("RETAIL_SECTOR_CODE") && !createPanel.includes("selectedRetailSubtypeCode") && !createPanel.includes("RETAIL_SUBTYPE_OPTIONS"),
  "Administration DTSC must not contain a Retail-only subtype branch anymore",
);
check(
  createPanel.includes('t("businessSubtypeLabel")') && clientCopy.includes("businessSubtypeLabel") && clientCopy.includes("fr: {") && clientCopy.includes("en: {"),
  "Generic subtype form copy must use the FR/EN Console dictionary",
);
check(
  regression.includes('qa-605-generic-sector-subtypes.mjs'),
  "Generic subtype QA must remain wired into the canonical regression gate",
);
check(
  architectureDoc.includes("TAILORING_APPAREL") && architectureDoc.includes("ACTIVE") && architectureDoc.includes("#607"),
  "Architecture documentation must describe Tailoring activation after its dedicated implementation",
);
check(
  architectureDoc.includes("20260909002000_generic_business_subtype_selection") && architectureDoc.includes("Retail historique sans marqueur #512"),
  "Architecture documentation must describe the additive migration and legacy Shop backfill",
);
check(
  architectureDoc.includes("Aucune donnée métier du tenant n’est supprimée ou transformée par #605"),
  "Rollback/data boundary must state that business data remains untouched",
);

if (failures.length) {
  console.error(`qa-605-generic-sector-subtypes: ${failures.length} failure(s)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("qa-605-generic-sector-subtypes: OK");
