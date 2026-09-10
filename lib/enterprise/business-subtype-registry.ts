export const BUSINESS_SUBTYPE_IMPLEMENTATION_STATUSES = ["ACTIVE", "PLANNED"] as const;
export type BusinessSubtypeImplementationStatus = (typeof BUSINESS_SUBTYPE_IMPLEMENTATION_STATUSES)[number];

export const BUSINESS_SUBTYPE_CODES = ["SHOP", "TAILORING_APPAREL"] as const;
export type BusinessSubtypeCode = (typeof BUSINESS_SUBTYPE_CODES)[number];

export type BusinessSubtypeDefinition = {
  sectorCode: string;
  code: BusinessSubtypeCode;
  labelFr: string;
  labelEn: string;
  descriptionFr: string;
  descriptionEn: string;
  implementationStatus: BusinessSubtypeImplementationStatus;
};

/**
 * Canonical cross-sector business subtype registry.
 *
 * The registry owns classification only. Module scope, provisioning and runtime
 * behavior remain owned by the relevant sector implementation. A PLANNED subtype
 * may be documented here before it becomes selectable, but must never be exposed
 * as ACTIVE without its real model/service/route/workspace/permission/entitlement/QA contract.
 */
export const BUSINESS_SUBTYPES = [
  {
    sectorCode: "COMMERCE_RETAIL",
    code: "SHOP",
    labelFr: "Shop",
    labelEn: "Shop",
    descriptionFr: "Commerce de détail avec point de vente, clôture Retail et extensions opérateur déjà disponibles dans DTSC Platform.",
    descriptionEn: "Retail shop with point of sale, Retail close and operator extensions already available in DTSC Platform.",
    implementationStatus: "ACTIVE",
  },
  {
    sectorCode: "MANUFACTURING",
    code: "TAILORING_APPAREL",
    labelFr: "Couture, confection & habillement",
    labelEn: "Tailoring, garment making & apparel",
    descriptionFr: "Sous-secteur Manufacturing pour les ateliers de couture, la confection sur mesure, le prêt-à-porter et les activités mixtes, intégré au moteur Manufacturing et aux sources ERP communes.",
    descriptionEn: "Manufacturing subtype for tailoring workshops, made-to-measure, ready-to-wear and mixed apparel operations, integrated with Manufacturing Core and shared ERP sources.",
    implementationStatus: "ACTIVE",
  },
] as const satisfies readonly BusinessSubtypeDefinition[];

function normalizeSectorCode(value: string | null | undefined) {
  return value?.trim().toUpperCase() || "";
}

export function isBusinessSubtypeCode(value: string | null | undefined): value is BusinessSubtypeCode {
  const normalized = value?.trim().toUpperCase() || "";
  return BUSINESS_SUBTYPE_CODES.includes(normalized as BusinessSubtypeCode);
}

export function normalizeBusinessSubtypeCode(value: string | null | undefined): BusinessSubtypeCode | null {
  const normalized = value?.trim().toUpperCase() || "";
  return isBusinessSubtypeCode(normalized) ? normalized : null;
}

export function listBusinessSubtypesForSector(
  sectorCode: string | null | undefined,
  options: { includePlanned?: boolean } = {},
) {
  const normalizedSector = normalizeSectorCode(sectorCode);
  return BUSINESS_SUBTYPES.filter((subtype) => {
    if (subtype.sectorCode !== normalizedSector) return false;
    return options.includePlanned || subtype.implementationStatus === "ACTIVE";
  });
}

export function getBusinessSubtypeForSector(
  sectorCode: string | null | undefined,
  subtypeCode: string | null | undefined,
  options: { includePlanned?: boolean } = {},
) {
  const normalizedSubtype = normalizeBusinessSubtypeCode(subtypeCode);
  if (!normalizedSubtype) return null;
  return listBusinessSubtypesForSector(sectorCode, options).find((subtype) => subtype.code === normalizedSubtype) || null;
}

export function businessSubtypeBelongsToSector(
  sectorCode: string | null | undefined,
  subtypeCode: string | null | undefined,
  options: { includePlanned?: boolean } = {},
) {
  return Boolean(getBusinessSubtypeForSector(sectorCode, subtypeCode, options));
}