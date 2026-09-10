"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Field, NativeSelect, priorityChoices, statusTone } from "@/components/enterprise/core-v2/erp-v2-ui";
import { ProfessionalError, ProfessionalHelp, ProfessionalLoading, ProfessionalTabs, professionalMutation } from "@/components/enterprise/professional/professional-erp-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToastMessage } from "@/components/ui/use-toast-message";
import { ModuleMetric, ModuleMetrics } from "@/components/workspace/module-metrics";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { StatusBadge } from "@/components/workspace/status-badge";
import { TAILORING_MODULE_CODES, type TailoringModuleCode } from "@/lib/enterprise/tailoring/constants";
import { getTailoringUiCopy, tailoringStatusLabel } from "@/lib/enterprise/tailoring/i18n";
import {
  tailoringAlterationAreaChoices,
  tailoringAlterationTypeChoices,
  tailoringBundleStatusChoices,
  tailoringCuttingStatusChoices,
  tailoringFinishingStatusChoices,
  tailoringFittingResultChoices,
  tailoringGarmentTypeChoices,
  tailoringGrainDirectionChoices,
  tailoringMaterialProfileTypeChoices,
  tailoringMeasurementCodeChoices,
  tailoringMeasurementUnitChoices,
  tailoringOperatingModeChoices,
} from "@/lib/enterprise/tailoring/options";
import type { EnterpriseModuleDefinition } from "@/lib/enterprise/module-registry";

type Numeric = string | number;
type Ref = { id: string };
type Configuration = { id: string; operatingMode: string; defaultMeasurementUnit: string; revision: number };
type Measurement = Ref & { businessPartyId: string; label: string; version: number; measuredAt: string; status: string; values: Array<Ref & { measurementCode: string; value: Numeric; unit: string }> };
type Grade = Ref & { sizeCode: string; baseSizeCode: string | null; rules: Array<Ref & { measurementCode: string; deltaValue: Numeric; unit: string }> };
type Style = Ref & { code: string; name: string; garmentType: string; operatingMode: string; status: string; revision: number; sizeGrades: Grade[] };
type MaterialProfile = Ref & { catalogItemId: string; profileType: string; fabricWidthCm: Numeric | null; usableWidthCm: Numeric | null; shrinkageRate: Numeric | null; grainDirection: string | null };
type CuttingPlan = Ref & { reference: string; productionOrderId: string; plannedQuantity: Numeric; cutQuantity: Numeric; wasteQuantity: Numeric; status: string; revision: number };
type Fitting = Ref & { reference: string; productionOrderId: string; status: string; result: string; revision: number };
type Alteration = Ref & { reference: string; alterationType: string; status: string; revision: number };
type Bundle = Ref & { bundleCode: string; productionOrderId: string; quantity: Numeric; sizeCode: string | null; status: string; revision: number };
type Finishing = Ref & { garmentBundleId: string; status: string; pressed: boolean; threadTrimmed: boolean; fasteningsChecked: boolean; packaged: boolean; revision: number; garmentBundle: { bundleCode: string } };
type ChoiceRef = Ref & Record<string, unknown>;
type Overview = {
  measurementProfiles: number;
  activeStyles: number;
  scheduledFittings: number;
  openAlterations: number;
  cuttingPlans: Array<{ status: string; _count: { _all: number } }>;
  bundlesByStatus: Array<{ status: string; _count: { _all: number }; _sum: { quantity: Numeric | null } }>;
  finishingByStatus: Array<{ status: string; _count: { _all: number } }>;
};
type References = {
  configuration: Configuration | null;
  customers: Array<ChoiceRef & { code: string; legalName: string; displayName: string | null }>;
  catalogItems: Array<ChoiceRef & { code: string; name: string; trackInventory: boolean }>;
  productionOrders: Array<ChoiceRef & { reference: string; title: string }>;
  employees: Array<ChoiceRef & { employeeNumber: string; displayName: string }>;
  workCenters: Array<ChoiceRef & { code: string; name: string }>;
  boms: Array<ChoiceRef & { code: string; name: string; version: number }>;
  routings: Array<ChoiceRef & { code: string; name: string; version: number }>;
  qualityChecks: Array<ChoiceRef & { result: string; checkType: string; quantityAccepted: Numeric; quantityChecked: Numeric }>;
  measurementProfiles: Array<ChoiceRef & { label: string; version: number }>;
};
type Payload = {
  capabilities: { canWrite: boolean; canManage: boolean };
  overview: Overview;
  references: References;
  measurementProfiles?: Measurement[];
  styles?: Style[];
  materialProfiles?: MaterialProfile[];
  cuttingPlans?: CuttingPlan[];
  fittings?: Fitting[];
  alterations?: Alteration[];
  garmentBundles?: Bundle[];
  finishingRecords?: Finishing[];
};

type CardProps = { title: string; subtitle?: string; status?: string; locale?: string | null; children?: ReactNode };
function Card({ title, subtitle, status, locale, children }: CardProps) {
  return <article className="grid min-w-0 gap-3 rounded-2xl border border-dtsc-border bg-dtsc-surface p-4"><div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words font-black text-dtsc-ink">{title}</h3>{subtitle ? <p className="mt-1 break-words text-sm text-dtsc-muted">{subtitle}</p> : null}</div>{status ? <StatusBadge tone={statusTone(status)}>{tailoringStatusLabel(locale, status)}</StatusBadge> : null}</div>{children}</article>;
}
function TextArea({ name }: { name: string }) { return <textarea name={name} className="min-h-24 w-full min-w-0 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 py-2 text-base text-dtsc-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dtsc-blue md:text-sm" />; }
function pick<T extends Ref>(items: T[] | undefined, value: FormDataEntryValue | null) { return (items || []).find((item) => item.id === String(value || "")) || null; }

export function EnterpriseTailoringWorkspace({ organizationId, organizationName, definition, initialFocus, locale }: { organizationId: string; organizationName: string; definition: EnterpriseModuleDefinition; initialFocus: TailoringModuleCode; locale?: string | null }) {
  const router = useRouter();
  const copy = getTailoringUiCopy(locale);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  useToastMessage(message || mutationError);

  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError("");
    fetch(`/api/enterprise/${organizationId}/tailoring?moduleCode=${encodeURIComponent(initialFocus)}`, { cache: "no-store" })
      .then(async (response) => { const body = await response.json().catch(() => null) as (Payload & { message?: string; error?: string }) | null; if (!response.ok || !body) throw new Error(body?.message || body?.error || copy.loadFailed); if (active) setData(body); })
      .catch((error) => { if (active) setLoadError(error instanceof Error ? error.message : copy.loadFailed); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [copy.loadFailed, initialFocus, organizationId, refreshKey]);

  async function mutate(action: string, payload: unknown, entityId?: string) {
    setSubmitting(true); setMessage(""); setMutationError("");
    try { const result = await professionalMutation(`/api/enterprise/${organizationId}/tailoring?moduleCode=${encodeURIComponent(initialFocus)}`, { action, payload, entityId }); setMessage(copy.saved); setRefreshKey((value) => value + 1); return result; }
    catch (error) { setMutationError(error instanceof Error ? error.message : copy.actionFailed); return null; }
    finally { setSubmitting(false); }
  }

  const tabs = useMemo(() => {
    const labels: Record<TailoringModuleCode, string> = {
      TAILORING_OVERVIEW: copy.overview, TAILORING_MEASUREMENTS: copy.measurements, TAILORING_STYLES_PATTERNS: copy.styles,
      TAILORING_SIZE_GRADING: copy.grading, TAILORING_MATERIAL_PROFILES: copy.materials, TAILORING_CUTTING_PLANS: copy.cutting,
      TAILORING_FITTINGS: copy.fittings, TAILORING_ALTERATIONS: copy.alterations, TAILORING_GARMENT_TRACKING: copy.garments, TAILORING_FINISHING: copy.finishing,
    };
    return TAILORING_MODULE_CODES.map((id) => ({ id, label: labels[id] }));
  }, [copy]);

  if (loading && !data) return <ModuleWorkspace><ProfessionalLoading rows={6} /></ModuleWorkspace>;
  if (!data || loadError) return <ModuleWorkspace><ProfessionalError message={loadError || copy.unavailable} /></ModuleWorkspace>;

  const refs = data.references;
  const customers = refs.customers.map((item) => ({ id: item.id, label: `${item.code} · ${item.displayName || item.legalName}` }));
  const catalog = refs.catalogItems.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }));
  const stockItems = refs.catalogItems.filter((item) => item.trackInventory).map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }));
  const orders = refs.productionOrders.map((item) => ({ id: item.id, label: `${item.reference} · ${item.title}` }));
  const employees = refs.employees.map((item) => ({ id: item.id, label: `${item.employeeNumber} · ${item.displayName}` }));
  const centers = refs.workCenters.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }));
  const boms = refs.boms.map((item) => ({ id: item.id, label: `${item.code} v${item.version} · ${item.name}` }));
  const routings = refs.routings.map((item) => ({ id: item.id, label: `${item.code} v${item.version} · ${item.name}` }));
  const measurementRefs = refs.measurementProfiles.map((item) => ({ id: item.id, label: `${item.label} · v${item.version}` }));
  const styles = (data.styles || []).filter((item) => item.status !== "RETIRED").map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }));
  const cuttingPlans = (data.cuttingPlans || []).map((item) => ({ id: item.id, label: `${item.reference} · ${tailoringStatusLabel(locale, item.status)}` }));
  const fittings = (data.fittings || []).map((item) => ({ id: item.id, label: `${item.reference} · ${tailoringStatusLabel(locale, item.status)}` }));
  const adjustmentFittings = (data.fittings || []).filter((item) => item.status === "COMPLETED" && item.result === "ADJUSTMENTS_REQUIRED").map((item) => ({ id: item.id, label: `${item.reference} · ${copy.adjustmentRequired}` }));
  const alterations = (data.alterations || []).map((item) => ({ id: item.id, label: `${item.reference} · ${tailoringStatusLabel(locale, item.status)}` }));
  const bundles = (data.garmentBundles || []).map((item) => ({ id: item.id, label: `${item.bundleCode} · ${tailoringStatusLabel(locale, item.status)}` }));
  const quality = refs.qualityChecks.filter((item) => item.result === "PASS").map((item) => ({ id: item.id, label: `${tailoringStatusLabel(locale, item.result)} · ${Number(item.quantityAccepted)}/${Number(item.quantityChecked)}` }));
  const garmentTypes = tailoringGarmentTypeChoices(locale);

  const form = (title: string, handler: (event: FormEvent<HTMLFormElement>) => Promise<void>, children: ReactNode, disabled = false) => data.capabilities.canWrite ? <ModuleSection title={title}><form className="grid min-w-0 gap-4 md:grid-cols-2" onSubmit={handler}>{children}<div className="md:col-span-2"><Button type="submit" disabled={submitting || disabled}>{copy.save}</Button></div></form></ModuleSection> : null;

  return <ModuleWorkspace>
    <ModuleHeader eyebrow={copy.sectorEyebrow} title={locale === "en" ? definition.labelEn : definition.labelFr} description={`${organizationName} · ${locale === "en" ? definition.descriptionEn : definition.descriptionFr}`} />
    <div className="flex min-w-0 items-center gap-2"><div className="min-w-0 flex-1"><ProfessionalTabs value={initialFocus} onChange={(value) => router.push(`/enterprise-tailoring/${value}`)} items={tabs} /></div><Button type="button" variant="outline" onClick={() => setRefreshKey((value) => value + 1)} aria-label={copy.refresh} title={copy.refresh}><RefreshCw className="h-4 w-4" /></Button></div>
    {mutationError ? <ProfessionalError message={mutationError} /> : null}
    <ModuleMetrics><ModuleMetric label={copy.activeMeasurements} value={data.overview.measurementProfiles} /><ModuleMetric label={copy.activeStyles} value={data.overview.activeStyles} /><ModuleMetric label={copy.scheduledFittings} value={data.overview.scheduledFittings} /><ModuleMetric label={copy.openAlterations} value={data.overview.openAlterations} /></ModuleMetrics>
    <ModuleContent>
      {initialFocus === "TAILORING_OVERVIEW" ? <>
        {data.capabilities.canManage && refs.configuration ? <ModuleSection title={copy.configuration} description={copy.configurationHint}><form className="grid gap-4 md:grid-cols-2" onSubmit={async (event) => { event.preventDefault(); const values = new FormData(event.currentTarget); await mutate("SAVE_CONFIGURATION", { operatingMode: values.get("operatingMode"), defaultMeasurementUnit: values.get("defaultMeasurementUnit"), revision: refs.configuration!.revision }); }}><Field label={copy.operatingMode}><NativeSelect name="operatingMode" required defaultValue={refs.configuration.operatingMode} items={tailoringOperatingModeChoices(locale)} /></Field><Field label={copy.measurementUnit}><NativeSelect name="defaultMeasurementUnit" required defaultValue={refs.configuration.defaultMeasurementUnit} items={tailoringMeasurementUnitChoices()} /></Field><div className="md:col-span-2"><Button type="submit" disabled={submitting}>{copy.save}</Button></div></form></ModuleSection> : null}
        <ModuleSection title={copy.overview} description={copy.canonicalHint}><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{data.overview.cuttingPlans.map((item) => <Card key={`cut-${item.status}`} title={copy.cutting} status={item.status} locale={locale} subtitle={String(item._count._all)} />)}{data.overview.bundlesByStatus.map((item) => <Card key={`bundle-${item.status}`} title={copy.garments} status={item.status} locale={locale} subtitle={`${item._count._all} · ${Number(item._sum.quantity || 0)}`} />)}{data.overview.finishingByStatus.map((item) => <Card key={`finish-${item.status}`} title={copy.finishing} status={item.status} locale={locale} subtitle={String(item._count._all)} />)}</div></ModuleSection>
      </> : null}

      {initialFocus === "TAILORING_MEASUREMENTS" ? <>
        {form(copy.measurementNew, async (event) => { event.preventDefault(); const values = new FormData(event.currentTarget); await mutate("CREATE_MEASUREMENT_PROFILE", { businessPartyId: values.get("businessPartyId"), label: values.get("label"), measuredAt: values.get("measuredAt") || undefined, measuredByEmployeeId: values.get("measuredByEmployeeId") || null, notes: values.get("notes") || null, values: [{ measurementCode: values.get("measurementCode"), value: Number(values.get("measurementValue")), unit: values.get("unit") }] }); }, <><Field label={copy.customer}><NativeSelect name="businessPartyId" required items={customers} /></Field><Field label={copy.measurementLabel}><Input name="label" required /></Field><Field label={copy.measurementCode}><NativeSelect name="measurementCode" required items={tailoringMeasurementCodeChoices(locale)} /></Field><Field label={copy.measurementValue}><Input name="measurementValue" type="number" min="0.01" step="0.01" required /></Field><Field label={copy.measurementUnit}><NativeSelect name="unit" required defaultValue={refs.configuration?.defaultMeasurementUnit || "CM"} items={tailoringMeasurementUnitChoices()} /></Field><Field label={copy.measuredAt}><Input name="measuredAt" type="datetime-local" /></Field><Field label={copy.employee}><NativeSelect name="measuredByEmployeeId" items={employees} /></Field><Field label={copy.notes}><TextArea name="notes" /></Field></>, !customers.length)}
        <ModuleSection title={copy.measurementHistory} count={(data.measurementProfiles || []).length}><div className="grid gap-3">{(data.measurementProfiles || []).map((item) => <Card key={item.id} title={`${item.label} · v${item.version}`} status={item.status} locale={locale} subtitle={item.values.map((value) => `${tailoringMeasurementCodeChoices(locale).find((choice) => choice.id === value.measurementCode)?.label || value.measurementCode}: ${Number(value.value)} ${value.unit.toLowerCase()}`).join(" · ")} />)}</div></ModuleSection>
      </> : null}

      {initialFocus === "TAILORING_STYLES_PATTERNS" ? <>
        {form(copy.styleNew, async (event) => { event.preventDefault(); const values = new FormData(event.currentTarget); await mutate("CREATE_STYLE", { code: values.get("code"), name: values.get("name"), catalogItemId: values.get("catalogItemId"), garmentType: values.get("garmentType"), operatingMode: values.get("operatingMode"), patternReference: values.get("patternReference") || null, patternVersion: Number(values.get("patternVersion") || 1), bomId: values.get("bomId") || null, routingId: values.get("routingId") || null, notes: values.get("notes") || null }); }, <><Field label={copy.styleCode}><Input name="code" required /></Field><Field label={copy.styleName}><Input name="name" required /></Field><Field label={copy.product}><NativeSelect name="catalogItemId" required items={catalog} /></Field><Field label={copy.garmentType}><NativeSelect name="garmentType" required items={garmentTypes} /></Field><Field label={copy.operatingMode}><NativeSelect name="operatingMode" required defaultValue={refs.configuration?.operatingMode || "MIXED"} items={tailoringOperatingModeChoices(locale)} /></Field><Field label={copy.patternReference}><Input name="patternReference" /></Field><Field label={copy.patternVersion}><Input name="patternVersion" type="number" min="1" defaultValue="1" /></Field><Field label={copy.bom}><NativeSelect name="bomId" items={boms} /></Field><Field label={copy.routing}><NativeSelect name="routingId" items={routings} /></Field><Field label={copy.notes}><TextArea name="notes" /></Field></>, !catalog.length)}
        <ModuleSection title={copy.styles} count={(data.styles || []).length}><div className="grid gap-3">{(data.styles || []).map((item) => <Card key={item.id} title={`${item.code} · ${item.name}`} subtitle={garmentTypes.find((choice) => choice.id === item.garmentType)?.label || copy.garmentType} status={item.status} locale={locale}>{data.capabilities.canManage && item.status !== "RETIRED" ? <div className="flex flex-wrap gap-2">{item.status === "DRAFT" ? <Button type="button" disabled={submitting} onClick={() => void mutate("CHANGE_STYLE_STATUS", { revision: item.revision, action: "ACTIVATE" }, item.id)}>{copy.activate}</Button> : null}<Button type="button" variant="outline" disabled={submitting} onClick={() => void mutate("CHANGE_STYLE_STATUS", { revision: item.revision, action: "RETIRE" }, item.id)}>{copy.retire}</Button></div> : null}</Card>)}</div></ModuleSection>
      </> : null}

      {initialFocus === "TAILORING_SIZE_GRADING" ? <>
        {form(copy.gradeNew, async (event) => { event.preventDefault(); const values = new FormData(event.currentTarget); const code = String(values.get("measurementCode") || ""); const delta = String(values.get("deltaValue") || ""); await mutate("CREATE_SIZE_GRADE", { styleId: values.get("styleId"), sizeCode: values.get("sizeCode"), baseSizeCode: values.get("baseSizeCode") || null, sequence: 0, notes: values.get("notes") || null, rules: code && delta ? [{ measurementCode: code, deltaValue: Number(delta), unit: values.get("unit") || "CM" }] : [] }); }, <><Field label={copy.style}><NativeSelect name="styleId" required items={styles} /></Field><Field label={copy.size}><Input name="sizeCode" required /></Field><Field label={copy.baseSize}><Input name="baseSizeCode" /></Field><Field label={copy.gradeRule}><NativeSelect name="measurementCode" items={tailoringMeasurementCodeChoices(locale)} /></Field><Field label={copy.delta}><Input name="deltaValue" type="number" step="0.01" /></Field><Field label={copy.measurementUnit}><NativeSelect name="unit" defaultValue={refs.configuration?.defaultMeasurementUnit || "CM"} items={tailoringMeasurementUnitChoices()} /></Field><Field label={copy.notes}><TextArea name="notes" /></Field></>, !styles.length)}
        <ModuleSection title={copy.grading}><div className="grid gap-3">{(data.styles || []).flatMap((item) => item.sizeGrades.map((grade) => <Card key={grade.id} title={`${item.code} · ${grade.sizeCode}`} subtitle={`${copy.baseSize}: ${grade.baseSizeCode || "—"} · ${grade.rules.length} ${copy.gradeRule.toLowerCase()}`} />))}</div></ModuleSection>
      </> : null}

      {initialFocus === "TAILORING_MATERIAL_PROFILES" ? <>
        {form(copy.materialNew, async (event) => { event.preventDefault(); const values = new FormData(event.currentTarget); await mutate("CREATE_MATERIAL_PROFILE", { catalogItemId: values.get("catalogItemId"), profileType: values.get("profileType"), fabricWidthCm: values.get("fabricWidthCm") ? Number(values.get("fabricWidthCm")) : null, usableWidthCm: values.get("usableWidthCm") ? Number(values.get("usableWidthCm")) : null, shrinkageRate: values.get("shrinkageRate") ? Number(values.get("shrinkageRate")) : null, grainDirection: values.get("grainDirection") || null, colorFamily: values.get("colorFamily") || null, notes: values.get("notes") || null }); }, <><Field label={copy.product}><NativeSelect name="catalogItemId" required items={stockItems} /></Field><Field label={copy.profileType}><NativeSelect name="profileType" required defaultValue="FABRIC" items={tailoringMaterialProfileTypeChoices(locale)} /></Field><Field label={copy.fabricWidth}><Input name="fabricWidthCm" type="number" min="0.01" step="0.01" /></Field><Field label={copy.usableWidth}><Input name="usableWidthCm" type="number" min="0.01" step="0.01" /></Field><Field label={copy.shrinkage}><Input name="shrinkageRate" type="number" min="0" max="100" step="0.01" /></Field><Field label={copy.grainDirection}><NativeSelect name="grainDirection" items={tailoringGrainDirectionChoices(locale)} /></Field><Field label={copy.colorFamily}><Input name="colorFamily" /></Field><Field label={copy.notes}><TextArea name="notes" /></Field></>, !stockItems.length)}
        <ModuleSection title={copy.materials} count={(data.materialProfiles || []).length}><div className="grid gap-3 sm:grid-cols-2">{(data.materialProfiles || []).map((item) => <Card key={item.id} title={catalog.find((choice) => choice.id === item.catalogItemId)?.label || copy.product} subtitle={`${item.profileType === "FABRIC" ? copy.fabric : copy.trim}${item.fabricWidthCm ? ` · ${Number(item.fabricWidthCm)} cm` : ""}`} />)}</div></ModuleSection>
      </> : null}

      {initialFocus === "TAILORING_CUTTING_PLANS" ? <>
        {form(copy.cuttingNew, async (event) => { event.preventDefault(); const values = new FormData(event.currentTarget); await mutate("CREATE_CUTTING_PLAN", { productionOrderId: values.get("productionOrderId"), styleId: values.get("styleId") || null, materialRequirementId: null, fabricCatalogItemId: values.get("fabricCatalogItemId"), fabricWidthCm: values.get("fabricWidthCm") ? Number(values.get("fabricWidthCm")) : null, markerLengthCm: values.get("markerLengthCm") ? Number(values.get("markerLengthCm")) : null, layers: Number(values.get("layers") || 1), plannedQuantity: Number(values.get("plannedQuantity")), notes: values.get("notes") || null }); }, <><Field label={copy.productionOrder}><NativeSelect name="productionOrderId" required items={orders} /></Field><Field label={copy.style}><NativeSelect name="styleId" items={styles} /></Field><Field label={copy.fabric}><NativeSelect name="fabricCatalogItemId" required items={stockItems} /></Field><Field label={copy.fabricWidth}><Input name="fabricWidthCm" type="number" step="0.01" /></Field><Field label={copy.layers}><Input name="layers" type="number" min="1" defaultValue="1" required /></Field><Field label={copy.plannedQuantity}><Input name="plannedQuantity" type="number" min="0.001" step="0.001" required /></Field><Field label={copy.markerEfficiency}><Input name="markerLengthCm" type="number" min="0.01" step="0.01" /></Field><Field label={copy.notes}><TextArea name="notes" /></Field></>, !orders.length || !stockItems.length)}
        {form(copy.update, async (event) => { event.preventDefault(); const values = new FormData(event.currentTarget); const item = pick(data.cuttingPlans, values.get("entityId")); if (!item) return; await mutate("UPDATE_CUTTING_PLAN", { revision: item.revision, status: values.get("status"), cutQuantity: Number(values.get("cutQuantity") || 0), wasteQuantity: Number(values.get("wasteQuantity") || 0), markerEfficiency: values.get("markerEfficiency") ? Number(values.get("markerEfficiency")) : null, notes: values.get("notes") || null }, item.id); }, <><Field label={copy.cuttingPlan}><NativeSelect name="entityId" required items={cuttingPlans} /></Field><Field label={copy.status}><NativeSelect name="status" required items={tailoringCuttingStatusChoices(locale)} /></Field><Field label={copy.cutQuantity}><Input name="cutQuantity" type="number" min="0" step="0.001" required /></Field><Field label={copy.wasteQuantity}><Input name="wasteQuantity" type="number" min="0" step="0.001" required /></Field><Field label={copy.markerEfficiency}><Input name="markerEfficiency" type="number" min="0" max="100" step="0.01" /></Field><Field label={copy.notes}><TextArea name="notes" /></Field></>, !cuttingPlans.length)}
        <ModuleSection title={copy.cutting} description={copy.physicalWasteHint} count={(data.cuttingPlans || []).length}><div className="grid gap-3">{(data.cuttingPlans || []).map((item) => <Card key={item.id} title={item.reference} subtitle={`${Number(item.cutQuantity)} / ${Number(item.plannedQuantity)} · ${copy.wasteQuantity}: ${Number(item.wasteQuantity)}`} status={item.status} locale={locale} />)}</div></ModuleSection>
      </> : null}

      {initialFocus === "TAILORING_FITTINGS" ? <>
        {form(copy.fittingNew, async (event) => { event.preventDefault(); const values = new FormData(event.currentTarget); await mutate("CREATE_FITTING", { productionOrderId: values.get("productionOrderId"), measurementProfileId: values.get("measurementProfileId") || null, scheduledAt: values.get("scheduledAt") || null, fittedByEmployeeId: values.get("fittedByEmployeeId") || null, notes: values.get("notes") || null }); }, <><Field label={copy.productionOrder}><NativeSelect name="productionOrderId" required items={orders} /></Field><Field label={copy.measurementProfile}><NativeSelect name="measurementProfileId" items={measurementRefs} /></Field><Field label={copy.scheduleDate}><Input name="scheduledAt" type="datetime-local" /></Field><Field label={copy.employee}><NativeSelect name="fittedByEmployeeId" items={employees} /></Field><Field label={copy.notes}><TextArea name="notes" /></Field></>, !orders.length)}
        {form(copy.complete, async (event) => { event.preventDefault(); const values = new FormData(event.currentTarget); const item = pick(data.fittings, values.get("entityId")); if (!item) return; await mutate("COMPLETE_FITTING", { revision: item.revision, status: "COMPLETED", result: values.get("result"), fittedByEmployeeId: values.get("fittedByEmployeeId") || null, notes: values.get("notes") || null }, item.id); }, <><Field label={copy.fittings}><NativeSelect name="entityId" required items={fittings.filter((choice) => data.fittings?.find((item) => item.id === choice.id)?.status === "SCHEDULED")} /></Field><Field label={copy.fittingResult}><NativeSelect name="result" required items={tailoringFittingResultChoices(locale)} /></Field><Field label={copy.employee}><NativeSelect name="fittedByEmployeeId" items={employees} /></Field><Field label={copy.notes}><TextArea name="notes" /></Field></>, !fittings.length)}
        <ModuleSection title={copy.fittings} count={(data.fittings || []).length}><div className="grid gap-3">{(data.fittings || []).map((item) => <Card key={item.id} title={item.reference} subtitle={`${copy.fittingResult}: ${tailoringStatusLabel(locale, item.result)}`} status={item.status} locale={locale} />)}</div></ModuleSection>
      </> : null}

      {initialFocus === "TAILORING_ALTERATIONS" ? <>
        {form(copy.alterationNew, async (event) => { event.preventDefault(); const values = new FormData(event.currentTarget); await mutate("CREATE_ALTERATION", { fittingId: values.get("fittingId"), alterationType: values.get("alterationType"), areaCode: values.get("areaCode") || null, priority: values.get("priority") || "NORMAL", assignedEmployeeId: values.get("assignedEmployeeId") || null, dueAt: values.get("dueAt") || null, notes: values.get("notes") || null }); }, <><Field label={copy.fittings}><NativeSelect name="fittingId" required items={adjustmentFittings} /></Field><Field label={copy.alterationType}><NativeSelect name="alterationType" required items={tailoringAlterationTypeChoices(locale)} /></Field><Field label={copy.alterationArea}><NativeSelect name="areaCode" items={tailoringAlterationAreaChoices(locale)} /></Field><Field label={copy.priority}><NativeSelect name="priority" defaultValue="NORMAL" items={priorityChoices(locale)} /></Field><Field label={copy.employee}><NativeSelect name="assignedEmployeeId" items={employees} /></Field><Field label={copy.dueAt}><Input name="dueAt" type="datetime-local" /></Field><Field label={copy.notes}><TextArea name="notes" /></Field></>, !adjustmentFittings.length)}
        {form(copy.update, async (event) => { event.preventDefault(); const values = new FormData(event.currentTarget); const item = pick(data.alterations, values.get("entityId")); if (!item) return; await mutate("UPDATE_ALTERATION", { revision: item.revision, status: values.get("status"), assignedEmployeeId: values.get("assignedEmployeeId") || null, dueAt: values.get("dueAt") || null, notes: values.get("notes") || null }, item.id); }, <><Field label={copy.alterations}><NativeSelect name="entityId" required items={alterations} /></Field><Field label={copy.status}><NativeSelect name="status" required items={["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"].map((id) => ({ id, label: tailoringStatusLabel(locale, id) }))} /></Field><Field label={copy.employee}><NativeSelect name="assignedEmployeeId" items={employees} /></Field><Field label={copy.dueAt}><Input name="dueAt" type="datetime-local" /></Field><Field label={copy.notes}><TextArea name="notes" /></Field></>, !alterations.length)}
        <ModuleSection title={copy.alterations} count={(data.alterations || []).length}><div className="grid gap-3">{(data.alterations || []).map((item) => <Card key={item.id} title={item.reference} subtitle={tailoringAlterationTypeChoices(locale).find((choice) => choice.id === item.alterationType)?.label || copy.alterationType} status={item.status} locale={locale} />)}</div></ModuleSection>
      </> : null}

      {initialFocus === "TAILORING_GARMENT_TRACKING" ? <>
        {form(copy.bundleNew, async (event) => { event.preventDefault(); const values = new FormData(event.currentTarget); await mutate("CREATE_GARMENT_BUNDLE", { productionOrderId: values.get("productionOrderId"), cuttingPlanId: values.get("cuttingPlanId") || null, sizeCode: values.get("sizeCode") || null, quantity: Number(values.get("quantity")), currentWorkCenterId: values.get("currentWorkCenterId") || null, notes: values.get("notes") || null }); }, <><Field label={copy.productionOrder}><NativeSelect name="productionOrderId" required items={orders} /></Field><Field label={copy.cuttingPlan}><NativeSelect name="cuttingPlanId" items={cuttingPlans} /></Field><Field label={copy.size}><Input name="sizeCode" /></Field><Field label={copy.quantity}><Input name="quantity" type="number" min="0.001" step="0.001" required /></Field><Field label={copy.workCenter}><NativeSelect name="currentWorkCenterId" items={centers} /></Field><Field label={copy.notes}><TextArea name="notes" /></Field></>, !orders.length)}
        {form(copy.update, async (event) => { event.preventDefault(); const values = new FormData(event.currentTarget); const item = pick(data.garmentBundles, values.get("entityId")); if (!item) return; await mutate("UPDATE_GARMENT_BUNDLE", { revision: item.revision, status: values.get("status"), currentWorkCenterId: values.get("currentWorkCenterId") || null, notes: values.get("notes") || null }, item.id); }, <><Field label={copy.garments}><NativeSelect name="entityId" required items={bundles} /></Field><Field label={copy.status}><NativeSelect name="status" required items={tailoringBundleStatusChoices(locale)} /></Field><Field label={copy.workCenter}><NativeSelect name="currentWorkCenterId" items={centers} /></Field><Field label={copy.notes}><TextArea name="notes" /></Field></>, !bundles.length)}
        <ModuleSection title={copy.garments} description={copy.deliveryHint} count={(data.garmentBundles || []).length}><div className="grid gap-3">{(data.garmentBundles || []).map((item) => <Card key={item.id} title={item.bundleCode} subtitle={`${copy.quantity}: ${Number(item.quantity)}${item.sizeCode ? ` · ${copy.size}: ${item.sizeCode}` : ""}`} status={item.status} locale={locale} />)}</div></ModuleSection>
      </> : null}

      {initialFocus === "TAILORING_FINISHING" ? <>
        {form(copy.finishingChecklist, async (event) => { event.preventDefault(); const values = new FormData(event.currentTarget); const existing = (data.finishingRecords || []).find((item) => item.garmentBundleId === String(values.get("garmentBundleId") || "")); await mutate("UPSERT_FINISHING", { productionOrderId: values.get("productionOrderId"), garmentBundleId: values.get("garmentBundleId"), qualityCheckId: values.get("qualityCheckId") || null, status: values.get("status"), pressed: values.get("pressed") === "on", threadTrimmed: values.get("threadTrimmed") === "on", fasteningsChecked: values.get("fasteningsChecked") === "on", packaged: values.get("packaged") === "on", completedByEmployeeId: values.get("completedByEmployeeId") || null, notes: values.get("notes") || null, revision: existing?.revision }); }, <><Field label={copy.productionOrder}><NativeSelect name="productionOrderId" required items={orders} /></Field><Field label={copy.garments}><NativeSelect name="garmentBundleId" required items={bundles} /></Field><Field label={copy.qualityCheck}><NativeSelect name="qualityCheckId" items={quality} /></Field><Field label={copy.status}><NativeSelect name="status" required defaultValue="IN_PROGRESS" items={tailoringFinishingStatusChoices(locale)} /></Field><Field label={copy.employee}><NativeSelect name="completedByEmployeeId" items={employees} /></Field><Field label={copy.notes}><TextArea name="notes" /></Field><div className="grid gap-2 md:col-span-2 sm:grid-cols-2 lg:grid-cols-4">{[["pressed", copy.pressed], ["threadTrimmed", copy.threadTrimmed], ["fasteningsChecked", copy.fasteningsChecked], ["packaged", copy.packaged]].map(([name, label]) => <label key={name} className="flex min-h-11 items-center gap-2 rounded-xl border border-dtsc-border px-3 text-sm font-semibold"><input type="checkbox" name={name} />{label}</label>)}</div></>, !bundles.length)}
        <ModuleSection title={copy.finishing} count={(data.finishingRecords || []).length}><div className="grid gap-3">{(data.finishingRecords || []).map((item) => <Card key={item.id} title={item.garmentBundle.bundleCode} subtitle={`${copy.finishingChecklist}: ${[item.pressed, item.threadTrimmed, item.fasteningsChecked, item.packaged].filter(Boolean).length}/4`} status={item.status} locale={locale} />)}</div></ModuleSection>
      </> : null}
      <ProfessionalHelp moduleCode={initialFocus} />
    </ModuleContent>
  </ModuleWorkspace>;
}
