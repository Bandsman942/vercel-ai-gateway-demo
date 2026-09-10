import { z } from "zod";
import {
  TAILORING_ALTERATION_AREAS,
  TAILORING_ALTERATION_PRIORITIES,
  TAILORING_ALTERATION_STATUSES,
  TAILORING_ALTERATION_TYPES,
  TAILORING_BUNDLE_STATUSES,
  TAILORING_CUTTING_PLAN_STATUSES,
  TAILORING_DEFINITION_STATUSES,
  TAILORING_FINISHING_STATUSES,
  TAILORING_FITTING_RESULTS,
  TAILORING_FITTING_STATUSES,
  TAILORING_GARMENT_TYPES,
  TAILORING_GRAIN_DIRECTIONS,
  TAILORING_MATERIAL_PROFILE_TYPES,
  TAILORING_MEASUREMENT_CODES,
  TAILORING_MEASUREMENT_UNITS,
  TAILORING_OPERATING_MODES,
} from "@/lib/enterprise/tailoring/constants";

const optionalText = (max = 4000) => z.string().trim().max(max).optional().nullable().or(z.literal(""));
const optionalId = z.string().trim().max(180).optional().nullable().or(z.literal(""));
const requiredId = z.string().trim().min(1).max(180);
const optionalDate = z.coerce.date().optional().nullable();
const revision = z.coerce.number().int().positive();
const quantity = z.coerce.number().positive().max(1_000_000_000);

export const tailoringConfigurationSchema = z.object({
  operatingMode: z.enum(TAILORING_OPERATING_MODES),
  defaultMeasurementUnit: z.enum(TAILORING_MEASUREMENT_UNITS),
  revision,
});

const tailoringMeasurementValueSchema = z.object({
  measurementCode: z.enum(TAILORING_MEASUREMENT_CODES),
  value: z.coerce.number().positive().max(10000),
  unit: z.enum(TAILORING_MEASUREMENT_UNITS),
  notes: optionalText(1000),
});

export const tailoringMeasurementProfileCreateSchema = z.object({
  businessPartyId: requiredId,
  label: z.string().trim().min(2).max(180),
  measuredAt: z.coerce.date().optional(),
  measuredByEmployeeId: optionalId,
  notes: optionalText(3000),
  values: z.array(tailoringMeasurementValueSchema).min(1).max(TAILORING_MEASUREMENT_CODES.length),
}).superRefine((data, ctx) => {
  const codes = data.values.map((item) => item.measurementCode);
  if (new Set(codes).size !== codes.length) {
    ctx.addIssue({ code: "custom", path: ["values"], message: "Une mensuration ne peut être renseignée qu’une seule fois dans le même relevé." });
  }
});

export const tailoringStyleCreateSchema = z.object({
  code: z.string().trim().min(2).max(80).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(220),
  catalogItemId: requiredId,
  garmentType: z.enum(TAILORING_GARMENT_TYPES),
  operatingMode: z.enum(TAILORING_OPERATING_MODES),
  patternReference: optionalText(160),
  patternVersion: z.coerce.number().int().positive().max(9999).default(1),
  bomId: optionalId,
  routingId: optionalId,
  notes: optionalText(5000),
});

export const tailoringDefinitionActionSchema = z.object({
  revision,
  action: z.enum(["ACTIVATE", "RETIRE"]),
});

const tailoringGradeRuleSchema = z.object({
  measurementCode: z.enum(TAILORING_MEASUREMENT_CODES),
  deltaValue: z.coerce.number().min(-1000).max(1000),
  unit: z.enum(TAILORING_MEASUREMENT_UNITS),
});

export const tailoringSizeGradeCreateSchema = z.object({
  styleId: requiredId,
  sizeCode: z.string().trim().min(1).max(40).transform((value) => value.toUpperCase()),
  baseSizeCode: optionalText(40),
  sequence: z.coerce.number().int().min(0).max(10000).default(0),
  notes: optionalText(2000),
  rules: z.array(tailoringGradeRuleSchema).max(TAILORING_MEASUREMENT_CODES.length).default([]),
}).superRefine((data, ctx) => {
  const codes = data.rules.map((item) => item.measurementCode);
  if (new Set(codes).size !== codes.length) {
    ctx.addIssue({ code: "custom", path: ["rules"], message: "Une règle de gradation ne peut apparaître qu’une seule fois par mensuration." });
  }
});

export const tailoringMaterialProfileSchema = z.object({
  catalogItemId: requiredId,
  profileType: z.enum(TAILORING_MATERIAL_PROFILE_TYPES),
  fabricWidthCm: z.coerce.number().positive().max(1000).optional().nullable(),
  usableWidthCm: z.coerce.number().positive().max(1000).optional().nullable(),
  shrinkageRate: z.coerce.number().min(0).max(100).optional().nullable(),
  grainDirection: z.enum(TAILORING_GRAIN_DIRECTIONS).optional().nullable(),
  colorFamily: optionalText(120),
  notes: optionalText(3000),
}).superRefine((data, ctx) => {
  if (data.profileType === "FABRIC" && !data.fabricWidthCm) {
    ctx.addIssue({ code: "custom", path: ["fabricWidthCm"], message: "La largeur du tissu est obligatoire pour un profil tissu." });
  }
  if (data.fabricWidthCm && data.usableWidthCm && data.usableWidthCm > data.fabricWidthCm) {
    ctx.addIssue({ code: "custom", path: ["usableWidthCm"], message: "La largeur utile ne peut pas dépasser la largeur totale du tissu." });
  }
});

export const tailoringCuttingPlanCreateSchema = z.object({
  productionOrderId: requiredId,
  styleId: optionalId,
  materialRequirementId: optionalId,
  fabricCatalogItemId: requiredId,
  fabricWidthCm: z.coerce.number().positive().max(1000).optional().nullable(),
  markerLengthCm: z.coerce.number().positive().max(1_000_000).optional().nullable(),
  layers: z.coerce.number().int().positive().max(10000).default(1),
  plannedQuantity: quantity,
  notes: optionalText(4000),
});

export const tailoringCuttingPlanUpdateSchema = z.object({
  revision,
  status: z.enum(TAILORING_CUTTING_PLAN_STATUSES),
  cutQuantity: z.coerce.number().min(0).max(1_000_000_000),
  wasteQuantity: z.coerce.number().min(0).max(1_000_000_000),
  markerEfficiency: z.coerce.number().min(0).max(100).optional().nullable(),
  notes: optionalText(4000),
});

export const tailoringFittingCreateSchema = z.object({
  productionOrderId: requiredId,
  measurementProfileId: optionalId,
  scheduledAt: optionalDate,
  fittedByEmployeeId: optionalId,
  notes: optionalText(4000),
});

export const tailoringFittingCompleteSchema = z.object({
  revision,
  status: z.enum(TAILORING_FITTING_STATUSES).default("COMPLETED"),
  result: z.enum(TAILORING_FITTING_RESULTS),
  fittedByEmployeeId: optionalId,
  notes: optionalText(4000),
}).superRefine((data, ctx) => {
  if (data.status === "COMPLETED" && data.result === "PENDING") {
    ctx.addIssue({ code: "custom", path: ["result"], message: "Un essayage terminé doit avoir un résultat." });
  }
});

export const tailoringAlterationCreateSchema = z.object({
  fittingId: requiredId,
  alterationType: z.enum(TAILORING_ALTERATION_TYPES),
  areaCode: z.enum(TAILORING_ALTERATION_AREAS).optional().nullable(),
  priority: z.enum(TAILORING_ALTERATION_PRIORITIES).default("NORMAL"),
  assignedEmployeeId: optionalId,
  dueAt: optionalDate,
  notes: optionalText(4000),
});

export const tailoringAlterationUpdateSchema = z.object({
  revision,
  status: z.enum(TAILORING_ALTERATION_STATUSES),
  assignedEmployeeId: optionalId,
  dueAt: optionalDate,
  notes: optionalText(4000),
});

export const tailoringGarmentBundleCreateSchema = z.object({
  productionOrderId: requiredId,
  cuttingPlanId: optionalId,
  sizeCode: optionalText(40),
  quantity,
  currentWorkCenterId: optionalId,
  notes: optionalText(3000),
});

export const tailoringGarmentBundleUpdateSchema = z.object({
  revision,
  status: z.enum(TAILORING_BUNDLE_STATUSES),
  currentWorkCenterId: optionalId,
  notes: optionalText(3000),
});

export const tailoringFinishingSchema = z.object({
  productionOrderId: requiredId,
  garmentBundleId: requiredId,
  qualityCheckId: optionalId,
  status: z.enum(TAILORING_FINISHING_STATUSES),
  pressed: z.coerce.boolean().default(false),
  threadTrimmed: z.coerce.boolean().default(false),
  fasteningsChecked: z.coerce.boolean().default(false),
  packaged: z.coerce.boolean().default(false),
  completedByEmployeeId: optionalId,
  notes: optionalText(4000),
  revision: z.coerce.number().int().positive().optional(),
});

export const tailoringStatusSchema = z.enum(TAILORING_DEFINITION_STATUSES);
