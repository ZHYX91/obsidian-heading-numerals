import {
  CONFIDENCES,
  DISPLAY_MODES,
  SCHEME_IDS,
  type CleanupThreshold,
  type DisplayMode,
  type MissingLevelStrategy,
  type NumberingOptions,
  type SchemeId,
} from "../core/types";

export interface HeadingNumeralsSettings {
  language: "auto" | "en" | "zh";
  displayMode: DisplayMode;
  scheme: SchemeId;
  customTemplates: string[];
  customBaseLevel: number;
  maxLevel: number;
  missingLevelStrategy: MissingLevelStrategy;
  writeMarkers: boolean;
  cleanupThreshold: CleanupThreshold;
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
  after: string;
}

export interface LastBatchSnapshot {
  createdAt: string;
  operation: "write" | "remove" | "renumber" | "strip-markers";
  status: "pending" | "applied";
  files: BatchFileSnapshot[];
}

export interface PersistedPluginData {
  settings: HeadingNumeralsSettings;
  lastBatch: LastBatchSnapshot | null;
}

export const DEFAULT_CUSTOM_TEMPLATES = [
  "{1.arabic}",
  "{1.arabic}.{2.arabic}",
  "{1.arabic}.{2.arabic}.{3.arabic}",
  "{1.arabic}.{2.arabic}.{3.arabic}.{4.arabic}",
  "{1.arabic}.{2.arabic}.{3.arabic}.{4.arabic}.{5.arabic}",
  "{1.arabic}.{2.arabic}.{3.arabic}.{4.arabic}.{5.arabic}.{6.arabic}",
];

export const DEFAULT_SETTINGS: HeadingNumeralsSettings = {
  language: "auto",
  displayMode: "normal",
  scheme: "hierarchical-h2",
  customTemplates: [...DEFAULT_CUSTOM_TEMPLATES],
  customBaseLevel: 1,
  maxLevel: 6,
  missingLevelStrategy: "fill-one",
  writeMarkers: false,
  cleanupThreshold: "high",
  removeMultiplePrefixes: true,
  normalizeManualOnRenumber: true,
  revealOnActiveLine: true,
  enableLivePreview: true,
  enableReadingView: true,
  enableSourceMode: false,
  virtualOpacity: 0.62,
  virtualGapEm: 0.35,
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

export function sanitizeSettings(value: unknown): HeadingNumeralsSettings {
  const raw = isRecord(value) ? value : {};
  const rawTemplates: unknown[] | null = Array.isArray(raw.customTemplates)
    ? raw.customTemplates as unknown[]
    : null;
  const templates = rawTemplates != null
    ? Array.from({ length: 6 }, (_unused, index) => {
      const template = rawTemplates[index];
      return typeof template === "string" ? template.slice(0, 300) : DEFAULT_CUSTOM_TEMPLATES[index] ?? "";
    })
    : [...DEFAULT_CUSTOM_TEMPLATES];
  const excludedFolders = Array.isArray(raw.excludedFolders)
    ? raw.excludedFolders
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "").trim())
      .filter((entry, index, all) => entry.length > 0 && all.indexOf(entry) === index)
    : [];

  return {
    language: oneOf(raw.language, ["auto", "en", "zh"] as const, DEFAULT_SETTINGS.language),
    displayMode: oneOf(raw.displayMode, DISPLAY_MODES, DEFAULT_SETTINGS.displayMode),
    scheme: oneOf(raw.scheme, SCHEME_IDS, DEFAULT_SETTINGS.scheme),
    customTemplates: templates,
    customBaseLevel: Math.trunc(boundedNumber(raw.customBaseLevel, DEFAULT_SETTINGS.customBaseLevel, 1, 6)),
    maxLevel: Math.trunc(boundedNumber(raw.maxLevel, DEFAULT_SETTINGS.maxLevel, 1, 6)),
    missingLevelStrategy: oneOf(
      raw.missingLevelStrategy,
      ["fill-one", "current-only", "skip"] as const,
      DEFAULT_SETTINGS.missingLevelStrategy,
    ),
    writeMarkers: booleanOr(raw.writeMarkers, DEFAULT_SETTINGS.writeMarkers),
    cleanupThreshold: oneOf(
      raw.cleanupThreshold,
      ["plugin", "high", "medium"] as const,
      DEFAULT_SETTINGS.cleanupThreshold,
    ),
    removeMultiplePrefixes: booleanOr(raw.removeMultiplePrefixes, DEFAULT_SETTINGS.removeMultiplePrefixes),
    normalizeManualOnRenumber: booleanOr(
      raw.normalizeManualOnRenumber,
      DEFAULT_SETTINGS.normalizeManualOnRenumber,
    ),
    revealOnActiveLine: booleanOr(raw.revealOnActiveLine, DEFAULT_SETTINGS.revealOnActiveLine),
    enableLivePreview: booleanOr(raw.enableLivePreview, DEFAULT_SETTINGS.enableLivePreview),
    enableReadingView: booleanOr(raw.enableReadingView, DEFAULT_SETTINGS.enableReadingView),
    enableSourceMode: booleanOr(raw.enableSourceMode, DEFAULT_SETTINGS.enableSourceMode),
    virtualOpacity: boundedNumber(raw.virtualOpacity, DEFAULT_SETTINGS.virtualOpacity, 0.15, 1),
    virtualGapEm: boundedNumber(raw.virtualGapEm, DEFAULT_SETTINGS.virtualGapEm, 0, 2),
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
    && typeof value.after === "string";
}

function sanitizeLastBatch(value: unknown): LastBatchSnapshot | null {
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
    files: value.files.map((file) => ({ ...file })),
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

export function toNumberingOptions(
  settings: HeadingNumeralsSettings,
  overrides: Readonly<{
    scheme?: SchemeId;
    starts?: Readonly<Partial<Record<1 | 2 | 3 | 4 | 5 | 6, number>>>;
  }> = {},
): NumberingOptions {
  return {
    scheme: overrides.scheme ?? settings.scheme,
    customTemplates: settings.customTemplates,
    customBaseLevel: settings.customBaseLevel,
    maxLevel: settings.maxLevel,
    missingLevelStrategy: settings.missingLevelStrategy,
    starts: overrides.starts ?? {},
  };
}

export function isKnownConfidence(value: unknown): value is CleanupThreshold {
  return value === "plugin" || (typeof value === "string" && CONFIDENCES.includes(value as never) && value !== "low" && value !== "certain");
}
