import {
  CONFIDENCES,
  DISPLAY_MODES,
  type CleanupScope,
  type CleanupTemplateHistory,
  type CleanupTemplateSource,
  type CustomNumberingScheme,
  type HeadingExclusionRule,
  displayModeToPreferences,
  type MissingLevelStrategy,
  type NumberingOptions,
  type SchemeId,
} from "../core/types";
import { compileTemplate } from "../core/template-compiler";
import { applyLegacyMaxLevel, legacyMaxLevelAffectsScheme } from "../core/legacy-max-level";
import { inspectSchemeTemplates } from "../core/scheme-template-validation";
import { BUILT_IN_SCHEMES, isBuiltInSchemeId, resolveScheme } from "../core/schemes";

export interface DocumentNumberingSettings {
  schemaVersion: 5;
  language: "auto" | "en" | "zh";
  showVirtualNumbers: boolean;
  concealStoredNumbers: boolean;
  showCaptionNumbers: boolean;
  showCrossReferences: boolean;
  selectedSchemeId: string;
  customSchemes: CustomNumberingScheme[];
  hiddenBuiltInSchemeIds: string[];
  cleanupHistory: CleanupTemplateHistory[];
  maxLevel: number;
  missingLevelStrategy: MissingLevelStrategy;
  writeMarkers: boolean;
  cleanupScope: CleanupScope;
  removeMultiplePrefixes: boolean;
  normalizeManualOnRenumber: boolean;
  revealOnActiveLine: boolean;
  enableLivePreview: boolean;
  enableReadingView: boolean;
  enableSourceMode: boolean;
  virtualOpacity: number;
  virtualGapEm: number;
  excludedFolders: string[];
  batchBackupLimitMb: number;
}

export interface BatchFileSnapshot {
  path: string;
  before: string;
  afterHash: string;
  /** 0.1 recovery compatibility; never written by 0.2+. */
  legacyAfter?: string;
  /** Raw 0.1 field accepted only while sanitizing. */
  after?: string;
}

export interface LastBatchSnapshot {
  createdAt: string;
  operation: "write" | "remove" | "renumber" | "strip-markers";
  status: "pending" | "applied";
  files: BatchFileSnapshot[];
}

export interface PersistedPluginData {
  settings: DocumentNumberingSettings;
  lastBatch: LastBatchSnapshot | null;
}

export interface MaxLevelRemovalProbe {
  readonly legacyMaxLevel: number;
  readonly affectedSchemeIds: readonly string[];
  readonly semanticallyInvalidCustomSchemeIds: readonly string[];
  readonly safeToRemove: boolean;
}

export const DEFAULT_CUSTOM_TEMPLATES = [
  "{1.arabic}",
  "{1.arabic}.{2.arabic}",
  "{1.arabic}.{2.arabic}.{3.arabic}",
  "{1.arabic}.{2.arabic}.{3.arabic}.{4.arabic}",
  "{1.arabic}.{2.arabic}.{3.arabic}.{4.arabic}.{5.arabic}",
  "{1.arabic}.{2.arabic}.{3.arabic}.{4.arabic}.{5.arabic}.{6.arabic}",
];

export const DEFAULT_SETTINGS: DocumentNumberingSettings = {
  schemaVersion: 5,
  language: "auto",
  showVirtualNumbers: false,
  concealStoredNumbers: false,
  showCaptionNumbers: true,
  showCrossReferences: true,
  selectedSchemeId: "hierarchical-h2",
  customSchemes: [],
  hiddenBuiltInSchemeIds: [],
  cleanupHistory: [],
  maxLevel: 6,
  missingLevelStrategy: "fill-one",
  writeMarkers: false,
  cleanupScope: "templates",
  removeMultiplePrefixes: true,
  normalizeManualOnRenumber: true,
  revealOnActiveLine: true,
  enableLivePreview: true,
  enableReadingView: true,
  enableSourceMode: false,
  virtualOpacity: 0.82,
  virtualGapEm: 0.32,
  excludedFolders: [],
  batchBackupLimitMb: 12,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? value as T
    : fallback;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function boundedNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function templates(value: unknown, fallback: readonly string[]): string[] {
  const source: readonly unknown[] = Array.isArray(value) ? value as unknown[] : fallback;
  return Array.from({ length: 6 }, (_unused, index) => {
    const template = source[index];
    return typeof template === "string" ? template.slice(0, 300) : fallback[index] ?? "";
  });
}

function validCustomId(value: unknown): value is string {
  return typeof value === "string"
    && /^custom-[a-z0-9][a-z0-9-]{0,55}$/u.test(value)
    && !isBuiltInSchemeId(value);
}

function sanitizeExclusions(value: unknown): HeadingExclusionRule[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const output: HeadingExclusionRule[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.title !== "string") continue;
    const title = item.title.normalize("NFC").trim().replace(/[ \t]+/gu, " ").slice(0, 200);
    if (title.length === 0 || seen.has(title)) continue;
    seen.add(title);
    output.push({
      title,
      scope: item.scope === "heading" ? "heading" : "subtree",
    });
  }
  return output;
}

function sanitizeCustomSchemes(value: unknown): CustomNumberingScheme[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const output: CustomNumberingScheme[] = [];
  for (const item of value) {
    if (!isRecord(item) || !validCustomId(item.id) || seen.has(item.id)) continue;
    const nextTemplates = templates(item.templates, DEFAULT_CUSTOM_TEMPLATES);
    if (nextTemplates.some((template) => compileTemplate(template).diagnostics.length > 0)) continue;
    seen.add(item.id);
    output.push({
      id: item.id,
      name: typeof item.name === "string" && item.name.trim().length > 0
        ? item.name.trim().slice(0, 80)
        : "Custom scheme",
      revision: Math.max(1, Math.trunc(boundedNumber(item.revision, 1, 1, Number.MAX_SAFE_INTEGER))),
      baseLevel: Math.trunc(boundedNumber(item.baseLevel, 1, 1, 6)),
      templates: nextTemplates,
      exclusions: sanitizeExclusions(item.exclusions),
    });
  }
  return output;
}

function sanitizeCleanupHistory(value: unknown): CleanupTemplateHistory[] {
  if (!Array.isArray(value)) return [];
  const output: CleanupTemplateHistory[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!isRecord(item) || typeof item.schemeId !== "string") continue;
    const revision = Math.max(1, Math.trunc(boundedNumber(item.revision, 1, 1, Number.MAX_SAFE_INTEGER)));
    const key = `${item.schemeId}@${revision}`;
    if (seen.has(key)) continue;
    const nextTemplates = templates(item.templates, []);
    if (nextTemplates.every((template) => template.length === 0)) continue;
    seen.add(key);
    output.push({
      schemeId: item.schemeId.slice(0, 64),
      schemeName: typeof item.schemeName === "string" ? item.schemeName.slice(0, 80) : item.schemeId,
      revision,
      baseLevel: Math.trunc(boundedNumber(item.baseLevel, 1, 1, 6)),
      templates: nextTemplates,
    });
  }
  return output;
}

export function sanitizeSettings(value: unknown): DocumentNumberingSettings {
  const raw = isRecord(value) ? value : {};
  const legacySchemaVersion = typeof raw.schemaVersion === "number" ? raw.schemaVersion : 0;
  const legacyDisplayMode = oneOf(raw.displayMode, DISPLAY_MODES, "normal");
  const legacyDisplay = displayModeToPreferences(legacyDisplayMode);
  const customSchemes = sanitizeCustomSchemes(raw.customSchemes);
  const legacyTemplates = templates(raw.customTemplates, DEFAULT_CUSTOM_TEMPLATES);
  const legacyUsesCustom = raw.scheme === "custom";
  const legacyChanged = legacyTemplates.some((template, index) => template !== DEFAULT_CUSTOM_TEMPLATES[index]);
  if (customSchemes.length === 0 && (legacyUsesCustom || legacyChanged)) {
    customSchemes.push({
      id: "custom-migrated",
      name: "Migrated custom scheme",
      revision: 1,
      baseLevel: Math.trunc(boundedNumber(raw.customBaseLevel, 1, 1, 6)),
      templates: legacyTemplates,
      exclusions: [],
    });
  }
  const requestedScheme = typeof raw.selectedSchemeId === "string"
    ? raw.selectedSchemeId
    : legacyUsesCustom ? "custom-migrated" : typeof raw.scheme === "string" ? raw.scheme : "hierarchical-h2";
  const selectedSchemeId = isBuiltInSchemeId(requestedScheme)
    || customSchemes.some((scheme) => scheme.id === requestedScheme)
    ? requestedScheme
    : DEFAULT_SETTINGS.selectedSchemeId;
  const hiddenBuiltInSchemeIds = Array.isArray(raw.hiddenBuiltInSchemeIds)
    ? raw.hiddenBuiltInSchemeIds
      .filter((id): id is string => typeof id === "string" && isBuiltInSchemeId(id))
      .filter((id, index, all) => all.indexOf(id) === index && id !== selectedSchemeId)
    : [];
  const excludedFolders = Array.isArray(raw.excludedFolders)
    ? raw.excludedFolders
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "").trim())
      .filter((entry, index, all) => entry.length > 0 && all.indexOf(entry) === index)
    : [];

  return {
    schemaVersion: 5,
    language: oneOf(raw.language, ["auto", "en", "zh"] as const, DEFAULT_SETTINGS.language),
    showVirtualNumbers: booleanOr(raw.showVirtualNumbers, legacyDisplay.showVirtualNumbers),
    concealStoredNumbers: booleanOr(raw.concealStoredNumbers, legacyDisplay.concealStoredNumbers),
    showCaptionNumbers: booleanOr(raw.showCaptionNumbers, DEFAULT_SETTINGS.showCaptionNumbers),
    showCrossReferences: booleanOr(raw.showCrossReferences, DEFAULT_SETTINGS.showCrossReferences),
    selectedSchemeId,
    customSchemes,
    hiddenBuiltInSchemeIds,
    cleanupHistory: sanitizeCleanupHistory(raw.cleanupHistory),
    maxLevel: Math.trunc(boundedNumber(raw.maxLevel, DEFAULT_SETTINGS.maxLevel, 1, 6)),
    missingLevelStrategy: oneOf(
      raw.missingLevelStrategy,
      ["fill-one", "current-only", "skip"] as const,
      DEFAULT_SETTINGS.missingLevelStrategy,
    ),
    writeMarkers: booleanOr(raw.writeMarkers, DEFAULT_SETTINGS.writeMarkers),
    cleanupScope: oneOf(raw.cleanupScope, ["plugin", "templates", "common"] as const,
      raw.cleanupThreshold === "plugin" ? "plugin"
        : raw.cleanupThreshold === "medium" ? "common" : DEFAULT_SETTINGS.cleanupScope),
    removeMultiplePrefixes: booleanOr(raw.removeMultiplePrefixes, DEFAULT_SETTINGS.removeMultiplePrefixes),
    normalizeManualOnRenumber: booleanOr(
      raw.normalizeManualOnRenumber,
      DEFAULT_SETTINGS.normalizeManualOnRenumber,
    ),
    revealOnActiveLine: booleanOr(raw.revealOnActiveLine, DEFAULT_SETTINGS.revealOnActiveLine),
    enableLivePreview: booleanOr(raw.enableLivePreview, DEFAULT_SETTINGS.enableLivePreview),
    enableReadingView: booleanOr(raw.enableReadingView, DEFAULT_SETTINGS.enableReadingView),
    enableSourceMode: booleanOr(raw.enableSourceMode, DEFAULT_SETTINGS.enableSourceMode),
    virtualOpacity: boundedNumber(
      legacySchemaVersion < 4 && raw.virtualOpacity === 0.62 ? DEFAULT_SETTINGS.virtualOpacity : raw.virtualOpacity,
      DEFAULT_SETTINGS.virtualOpacity,
      0.15,
      1,
    ),
    virtualGapEm: boundedNumber(
      legacySchemaVersion < 4 && raw.virtualGapEm === 0.35 ? DEFAULT_SETTINGS.virtualGapEm : raw.virtualGapEm,
      DEFAULT_SETTINGS.virtualGapEm,
      0,
      2,
    ),
    excludedFolders,
    batchBackupLimitMb: boundedNumber(
      raw.batchBackupLimitMb,
      DEFAULT_SETTINGS.batchBackupLimitMb,
      1,
      100,
    ),
  };
}

function isBatchFile(value: unknown): value is BatchFileSnapshot {
  return isRecord(value)
    && typeof value.path === "string"
    && typeof value.before === "string"
    && (typeof value.afterHash === "string" || typeof value.after === "string");
}

export function sanitizeLastBatch(value: unknown): LastBatchSnapshot | null {
  if (!isRecord(value) || !Array.isArray(value.files) || !value.files.every(isBatchFile)) {
    return null;
  }
  if (
    typeof value.createdAt !== "string"
    || !["write", "remove", "renumber", "strip-markers"].includes(String(value.operation))
    || !["pending", "applied"].includes(String(value.status))
  ) {
    return null;
  }
  return {
    createdAt: value.createdAt,
    operation: value.operation as LastBatchSnapshot["operation"],
    status: value.status as LastBatchSnapshot["status"],
    files: value.files.map((file) => ({
      path: file.path,
      before: file.before,
      afterHash: typeof file.afterHash === "string" ? file.afterHash : "legacy-exact",
      ...(typeof file.after === "string" ? { legacyAfter: file.after } : {}),
    })),
  };
}

export function sanitizePluginData(value: unknown): PersistedPluginData {
  if (!isRecord(value)) {
    return { settings: { ...DEFAULT_SETTINGS }, lastBatch: null };
  }
  const settingsValue = isRecord(value.settings) ? value.settings : value;
  return {
    settings: sanitizeSettings(settingsValue),
    lastBatch: sanitizeLastBatch(value.lastBatch),
  };
}

export function cloneSettings(settings: DocumentNumberingSettings): DocumentNumberingSettings {
  return {
    ...settings,
    customSchemes: settings.customSchemes.map((scheme) => ({
      ...scheme,
      templates: [...scheme.templates],
      exclusions: scheme.exclusions.map((rule) => ({ ...rule })),
    })),
    hiddenBuiltInSchemeIds: [...settings.hiddenBuiltInSchemeIds],
    cleanupHistory: settings.cleanupHistory.map((entry) => ({
      ...entry,
      templates: [...entry.templates],
    })),
    excludedFolders: [...settings.excludedFolders],
  };
}

export function toNumberingOptions(
  settings: DocumentNumberingSettings,
  overrides: Readonly<{
    schemeId?: SchemeId;
    starts?: Readonly<Partial<Record<1 | 2 | 3 | 4 | 5 | 6, number>>>;
  }> = {},
): NumberingOptions {
  const scheme = resolveScheme(overrides.schemeId ?? settings.selectedSchemeId, settings.customSchemes);
  return {
    scheme: applyLegacyMaxLevel(scheme, settings.maxLevel),
    missingLevelStrategy: settings.missingLevelStrategy,
    starts: overrides.starts ?? {},
  };
}

export function probeMaxLevelRemoval(settings: DocumentNumberingSettings): MaxLevelRemovalProbe {
  const schemes = [...Object.values(BUILT_IN_SCHEMES), ...settings.customSchemes];
  const affectedSchemeIds = schemes
    .filter((scheme) => legacyMaxLevelAffectsScheme(scheme, settings.maxLevel))
    .map((scheme) => scheme.id);
  const semanticallyInvalidCustomSchemeIds = settings.customSchemes
    .filter((scheme) => inspectSchemeTemplates(scheme.templates).length > 0)
    .map((scheme) => scheme.id);
  return {
    legacyMaxLevel: settings.maxLevel,
    affectedSchemeIds,
    semanticallyInvalidCustomSchemeIds,
    safeToRemove: affectedSchemeIds.length === 0 && semanticallyInvalidCustomSchemeIds.length === 0,
  };
}

export function cleanupTemplateSources(settings: DocumentNumberingSettings): CleanupTemplateSource[] {
  const sources: CleanupTemplateSource[] = Object.values(BUILT_IN_SCHEMES).map((scheme) => ({
    schemeId: scheme.id,
    schemeName: scheme.id,
    revision: 1,
    templates: scheme.templates,
  }));
  for (const scheme of settings.customSchemes) {
    sources.push({
      schemeId: scheme.id,
      schemeName: scheme.name,
      revision: scheme.revision,
      templates: scheme.templates,
    });
  }
  sources.push(...settings.cleanupHistory);
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.schemeId}@${source.revision}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isKnownConfidence(value: unknown): boolean {
  return value === "plugin" || (typeof value === "string" && CONFIDENCES.includes(value as never));
}
