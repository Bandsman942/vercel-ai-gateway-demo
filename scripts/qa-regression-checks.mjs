import fs from "node:fs";

const legacyPath = new URL("./qa-regression-checks-legacy.mjs", import.meta.url);
const legacySource = fs.readFileSync(legacyPath, "utf8");

function replaceExactlyOnce(source, obsoleteAssertion, canonicalAssertion, label) {
  const matches = source.split(obsoleteAssertion).length - 1;
  if (matches !== 1) {
    console.error(`FAIL QA regression adapter: assertion ${label} attendue exactement une fois, trouvée ${matches}.`);
    process.exit(1);
  }
  return source.replace(obsoleteAssertion, canonicalAssertion);
}

const obsoleteAppointmentAssertion = 'containsAll(healthAppointmentsWorkspace, ["ListControls", "ActionMenu", "Vue planning", "Aucun rendez-vous enregistré pour cette entreprise.", "Convertir en consultation", "Marquer absent", "h-[94dvh]", "CircleHelp", "min-w-0", "overflow-x-hidden"])';
const canonicalAppointmentAssertion = 'containsAll(healthAppointmentsWorkspace, ["ListControls", "ActionMenu", "appointment.viewPlanning", "appointment.emptyTitle", "appointment.action.convert", "appointment.action.absent", "h-[94dvh]", "CircleHelp", "min-w-0", "overflow-x-hidden"])';

const obsoleteConsultationAssertion = 'containsAll(healthConsultationsWorkspace, ["ListControls", "ActionMenu", "Constantes vitales", "Examen clinique", "Diagnostic", "Conduite à tenir", "Aucune consultation enregistrée.", "Clôturer", "Rouvrir", "h-[94dvh]", "CircleHelp", "min-w-0", "overflow-x-hidden"])';
const canonicalConsultationAssertion = 'containsAll(healthConsultationsWorkspace, ["ListControls", "ActionMenu", "consultation.section.vitals", "consultation.section.exam", "consultation.section.diagnosis", "consultation.section.management", "consultation.emptyTitle", "consultation.action.close", "consultation.action.reopen", "h-[94dvh]", "CircleHelp", "min-w-0", "overflow-x-hidden"])';

const obsoleteMedicalRecordsAssertion = 'containsAll(healthMedicalRecordsWorkspace, ["ListControls", "ActionMenu", "Alertes médicales actives", "Consultations liées", "Notes confidentielles", "Aucun dossier médical principal", "h-[94dvh]", "CircleHelp", "min-w-0", "overflow-x-hidden"])';
const canonicalMedicalRecordsAssertion = 'containsAll(healthMedicalRecordsWorkspace, ["ListControls", "ActionMenu", "medicalRecords.section.alerts", "medicalRecords.section.consultations", "medicalRecords.section.confidentialNotes", "medicalRecords.empty", "h-[94dvh]", "CircleHelp", "min-w-0", "overflow-x-hidden"])';

const obsoleteStaffAssertion = 'containsAll(healthStaffWorkspace, ["ListControls", "ActionMenu", "Professionnels actifs", "Permissions Santé", "Activité médicale liée", "Aucun professionnel santé enregistré", "h-[94dvh]", "CircleHelp", "min-w-0", "overflow-hidden"])';
const canonicalStaffAssertion = 'containsAll(healthStaffWorkspace, ["ListControls", "ActionMenu", "staff.dashboard.active", "staff.section.permissions", "staff.section.activity", "staff.empty", "h-[94dvh]", "CircleHelp", "min-w-0", "overflow-x-hidden"])';

const obsoleteLaboratoryAssertion = 'containsAll(healthLaboratoryWorkspace, ["ListControls", "ActionMenu", "Demandes du jour", "Prélèvements à faire", "Résultats validés", "Résultat critique", "Aucune demande laboratoire enregistrée", "h-[94dvh]", "CircleHelp", "min-w-0", "overflow-hidden"])';
const canonicalLaboratoryAssertion = 'containsAll(healthLaboratoryWorkspace, ["ListControls", "ActionMenu", "lab.dashboard.today", "lab.dashboard.toSample", "lab.dashboard.validated", "lab.badge.criticalResult", "lab.empty", "h-[94dvh]", "CircleHelp", "min-w-0", "overflow-x-hidden"])';

const obsoleteEnterpriseAdminAssertion = 'containsAll(enterpriseAdminPage, [\'activeContext === "ORGANIZATION"\', "canManageEnterpriseAdministration(session.userId, organizationId)", \'canUseFeature(organizationId, "enterprise-admin")\', "getEnterpriseAdministrationDataset(organizationId)"])';
const canonicalEnterpriseAdminAssertion = 'containsAll(enterpriseAdminPage, [\'activeContext === "ORGANIZATION"\', "requireEnterpriseMembership", "resolveEnterpriseModuleAccess", \'moduleCode: "ADMIN_DASHBOARD"\', \'action: "manage"\', "!membership || !adminAccess?.allowed", \'canUseFeature(organizationId, "enterprise-admin")\', "getEnterpriseAdministrationDataset(organizationId, user.id, administrationLocale)"])';

let migratedSource = replaceExactlyOnce(
  legacySource,
  obsoleteAppointmentAssertion,
  canonicalAppointmentAssertion,
  "Rendez-vous historique",
);
migratedSource = replaceExactlyOnce(
  migratedSource,
  obsoleteConsultationAssertion,
  canonicalConsultationAssertion,
  "Consultations historique",
);
migratedSource = replaceExactlyOnce(
  migratedSource,
  obsoleteMedicalRecordsAssertion,
  canonicalMedicalRecordsAssertion,
  "Dossiers médicaux historique",
);
migratedSource = replaceExactlyOnce(
  migratedSource,
  obsoleteStaffAssertion,
  canonicalStaffAssertion,
  "Équipe médicale historique",
);
migratedSource = replaceExactlyOnce(
  migratedSource,
  obsoleteLaboratoryAssertion,
  canonicalLaboratoryAssertion,
  "Laboratoire historique",
);
migratedSource = replaceExactlyOnce(
  migratedSource,
  obsoleteEnterpriseAdminAssertion,
  canonicalEnterpriseAdminAssertion,
  "Enterprise Admin historique",
);

const sourceUrl = `data:text/javascript;base64,${Buffer.from(migratedSource, "utf8").toString("base64")}`;
await import(sourceUrl);
await import("./qa-guided-form-contract-checks.mjs");
await import("./qa-controlled-form-reference-checks.mjs");
await import("./qa-operational-sla-filter-checks.mjs");
await import("./qa-media-proxy-hotfix.mjs");
await import("./qa-hotfix-512-retail-subtypes-mobile-money-forms.mjs");
await import("./qa-605-generic-sector-subtypes.mjs");
await import("./qa-606-manufacturing-core.mjs");
await import("./qa-607-tailoring-apparel.mjs");
await import("./qa-erp-accounting-approvals-511.mjs");
await import("./qa-billing-catalog-v2-checks.mjs");
await import("./qa-hotfix-574-finance-owner-e2e-contract.mjs");
await import("./qa-hotfix-576-finance-receivables-payables-payments.mjs");
await import("./qa-hotfix-576-finance-owner-e2e-contract.mjs");
await import("./qa-hotfix-578-procurement-link-parity.mjs");
await import("./qa-scale4g-durable-finance-reports.mjs");
await import("./qa-scale4-worker-claim-isolation.mjs");
await import("./qa-hotfix-590-canonical-party-contract.mjs");
await import("./qa-592-supplier-party-onboarding-checks.mjs");
await import("./qa-594-party-crm-canonical-ux.mjs");
await import("./qa-602-atomic-retail-posting.mjs");
