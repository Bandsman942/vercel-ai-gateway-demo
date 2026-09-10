import {
  TAILORING_ALTERATION_AREAS,
  TAILORING_ALTERATION_TYPES,
  TAILORING_BUNDLE_STATUSES,
  TAILORING_CUTTING_PLAN_STATUSES,
  TAILORING_FINISHING_STATUSES,
  TAILORING_FITTING_RESULTS,
  TAILORING_GARMENT_TYPES,
  TAILORING_GRAIN_DIRECTIONS,
  TAILORING_MATERIAL_PROFILE_TYPES,
  TAILORING_MEASUREMENT_CODES,
  TAILORING_MEASUREMENT_UNITS,
  TAILORING_OPERATING_MODES,
} from "@/lib/enterprise/tailoring/constants";
import { getTailoringUiCopy, tailoringStatusLabel } from "@/lib/enterprise/tailoring/i18n";

export type TailoringChoice = { id: string; label: string };

const labels = {
  fr: {
    measurements: {
      NECK: "Tour de cou", CHEST: "Tour de poitrine", WAIST: "Tour de taille", HIPS: "Tour de hanches",
      SHOULDER_WIDTH: "Largeur d’épaules", BACK_LENGTH: "Longueur dos", GARMENT_LENGTH: "Longueur vêtement",
      SLEEVE_LENGTH: "Longueur manche", BICEP: "Tour de biceps", WRIST: "Tour de poignet", RISE: "Fourche",
      INSEAM: "Entrejambe", OUTSEAM: "Longueur extérieure", THIGH: "Tour de cuisse", KNEE: "Tour de genou", ANKLE: "Tour de cheville",
    },
    grains: { LENGTHWISE: "Droit-fil", CROSSWISE: "Trame", BIAS: "Biais", NOT_APPLICABLE: "Non applicable" },
    alterationTypes: {
      TAKE_IN: "Resserrer", LET_OUT: "Élargir", SHORTEN: "Raccourcir", LENGTHEN: "Allonger", RESHAPE: "Restructurer",
      REPAIR: "Réparer", REPOSITION: "Repositionner", OTHER: "Autre",
    },
    alterationAreas: {
      COLLAR: "Col", SHOULDER: "Épaule", CHEST: "Poitrine", WAIST: "Taille", HIP: "Hanche", SLEEVE: "Manche",
      CUFF: "Poignet", HEM: "Ourlet", INSEAM: "Entrejambe", OUTSEAM: "Couture extérieure", ZIPPER: "Fermeture éclair",
      FASTENING: "Attache", OTHER: "Autre",
    },
    fittingResults: { PENDING: "En attente", PASS: "Conforme", ADJUSTMENTS_REQUIRED: "Ajustements requis" },
  },
  en: {
    measurements: {
      NECK: "Neck", CHEST: "Chest", WAIST: "Waist", HIPS: "Hips", SHOULDER_WIDTH: "Shoulder width",
      BACK_LENGTH: "Back length", GARMENT_LENGTH: "Garment length", SLEEVE_LENGTH: "Sleeve length", BICEP: "Bicep",
      WRIST: "Wrist", RISE: "Rise", INSEAM: "Inseam", OUTSEAM: "Outseam", THIGH: "Thigh", KNEE: "Knee", ANKLE: "Ankle",
    },
    grains: { LENGTHWISE: "Lengthwise grain", CROSSWISE: "Crosswise grain", BIAS: "Bias", NOT_APPLICABLE: "Not applicable" },
    alterationTypes: {
      TAKE_IN: "Take in", LET_OUT: "Let out", SHORTEN: "Shorten", LENGTHEN: "Lengthen", RESHAPE: "Reshape",
      REPAIR: "Repair", REPOSITION: "Reposition", OTHER: "Other",
    },
    alterationAreas: {
      COLLAR: "Collar", SHOULDER: "Shoulder", CHEST: "Chest", WAIST: "Waist", HIP: "Hip", SLEEVE: "Sleeve",
      CUFF: "Cuff", HEM: "Hem", INSEAM: "Inseam", OUTSEAM: "Outseam", ZIPPER: "Zipper", FASTENING: "Fastening", OTHER: "Other",
    },
    fittingResults: { PENDING: "Pending", PASS: "Pass", ADJUSTMENTS_REQUIRED: "Adjustments required" },
  },
} as const;

function localeKey(locale: string | null | undefined) {
  return locale === "en" ? "en" : "fr";
}

export function tailoringOperatingModeChoices(locale: string | null | undefined): TailoringChoice[] {
  const copy = getTailoringUiCopy(locale);
  const modeLabels = { MADE_TO_MEASURE: copy.madeToMeasure, READY_TO_WEAR: copy.readyToWear, MIXED: copy.mixed } as const;
  return TAILORING_OPERATING_MODES.map((id) => ({ id, label: modeLabels[id] }));
}

export function tailoringMeasurementUnitChoices(): TailoringChoice[] {
  return TAILORING_MEASUREMENT_UNITS.map((id) => ({ id, label: id === "CM" ? "cm" : "in" }));
}

export function tailoringMeasurementCodeChoices(locale: string | null | undefined): TailoringChoice[] {
  const dictionary = labels[localeKey(locale)].measurements;
  return TAILORING_MEASUREMENT_CODES.map((id) => ({ id, label: dictionary[id] }));
}

export function tailoringGarmentTypeChoices(locale: string | null | undefined): TailoringChoice[] {
  const copy = getTailoringUiCopy(locale);
  return TAILORING_GARMENT_TYPES.map((id) => ({ id, label: copy.garmentTypeLabels[id] }));
}

export function tailoringGrainDirectionChoices(locale: string | null | undefined): TailoringChoice[] {
  const dictionary = labels[localeKey(locale)].grains;
  return TAILORING_GRAIN_DIRECTIONS.map((id) => ({ id, label: dictionary[id] }));
}

export function tailoringMaterialProfileTypeChoices(locale: string | null | undefined): TailoringChoice[] {
  const copy = getTailoringUiCopy(locale);
  const profileLabels = { FABRIC: copy.fabric, TRIM: copy.trim } as const;
  return TAILORING_MATERIAL_PROFILE_TYPES.map((id) => ({ id, label: profileLabels[id] }));
}

export function tailoringCuttingStatusChoices(locale: string | null | undefined): TailoringChoice[] {
  return TAILORING_CUTTING_PLAN_STATUSES.map((id) => ({ id, label: tailoringStatusLabel(locale, id) }));
}

export function tailoringFittingResultChoices(locale: string | null | undefined): TailoringChoice[] {
  const dictionary = labels[localeKey(locale)].fittingResults;
  return TAILORING_FITTING_RESULTS.filter((id) => id !== "PENDING").map((id) => ({ id, label: dictionary[id] }));
}

export function tailoringAlterationTypeChoices(locale: string | null | undefined): TailoringChoice[] {
  const dictionary = labels[localeKey(locale)].alterationTypes;
  return TAILORING_ALTERATION_TYPES.map((id) => ({ id, label: dictionary[id] }));
}

export function tailoringAlterationAreaChoices(locale: string | null | undefined): TailoringChoice[] {
  const dictionary = labels[localeKey(locale)].alterationAreas;
  return TAILORING_ALTERATION_AREAS.map((id) => ({ id, label: dictionary[id] }));
}

export function tailoringBundleStatusChoices(locale: string | null | undefined): TailoringChoice[] {
  return TAILORING_BUNDLE_STATUSES.map((id) => ({ id, label: tailoringStatusLabel(locale, id) }));
}

export function tailoringFinishingStatusChoices(locale: string | null | undefined): TailoringChoice[] {
  return TAILORING_FINISHING_STATUSES.map((id) => ({ id, label: tailoringStatusLabel(locale, id) }));
}
