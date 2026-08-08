import { describe, expect, it } from "vitest";

import type { App, PluginManifest } from "obsidian";

import { RecoveryStore } from "../../src/adapters/obsidian/recovery-store";
import type { LastBatchSnapshot } from "../../src/config/settings";

function harness(initial: Readonly<Record<string, string>> = {}) {
  const files = new Map(Object.entries(initial));
  const adapter = {
    exists: async (path: string) => files.has(path),
    read: async (path: string) => {
      const value = files.get(path);
      if (value == null) throw new Error("missing");
      return value;
    },
    write: async (path: string, value: string) => { files.set(path, value); },
    remove: async (path: string) => { files.delete(path); },
    rename: async (from: string, to: string) => {
      const value = files.get(from);
      if (value == null) throw new Error("missing");
      files.delete(from);
      files.set(to, value);
    },
  };
  const app = { vault: { adapter } } as unknown as App;
  const manifest = { dir: ".obsidian/plugins/heading-numerals" } as PluginManifest;
  return { files, store: new RecoveryStore(app, manifest) };
}

const snapshot: LastBatchSnapshot = {
  createdAt: "2026-08-08T00:00:00.000Z",
  operation: "write",
  status: "applied",
  files: [{ path: "note.md", before: "# A", afterHash: "sha256:abc" }],
};

describe("RecoveryStore", () => {
  it("promotes the pending file and removes both paths when cleared", async () => {
    const { files, store } = harness();
    await store.save(snapshot);
    expect(files.has(".obsidian/plugins/heading-numerals/recovery.json")).toBe(true);
    expect(files.has(".obsidian/plugins/heading-numerals/recovery.pending.json")).toBe(false);
    await expect(store.load()).resolves.toEqual(snapshot);
    await store.save(null);
    expect(files.size).toBe(0);
  });

  it("recovers a valid pending snapshot left by an interrupted promotion", async () => {
    const path = ".obsidian/plugins/heading-numerals/recovery.pending.json";
    const { store } = harness({ [path]: JSON.stringify(snapshot) });
    await expect(store.load()).resolves.toEqual(snapshot);
  });
});
