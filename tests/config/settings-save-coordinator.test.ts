import { describe, expect, it, vi } from "vitest";

import { SettingsSaveCoordinator } from "../../src/config/settings-save-coordinator";

describe("SettingsSaveCoordinator", () => {
  it("coalesces scheduled writes to the newest snapshot", async () => {
    vi.useFakeTimers();
    const persisted: number[] = [];
    const coordinator = new SettingsSaveCoordinator<number>(async (value) => {
      persisted.push(value);
    }, 50);
    coordinator.schedule(1);
    coordinator.schedule(2);
    expect(coordinator.snapshot().state).toBe("scheduled");
    await vi.advanceTimersByTimeAsync(50);
    expect(persisted).toEqual([2]);
    expect(coordinator.snapshot().state).toBe("saved");
    vi.useRealTimers();
  });

  it("retains failed data and exposes an explicit retry path", async () => {
    let attempts = 0;
    const coordinator = new SettingsSaveCoordinator<string>(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("disk full");
    });
    await expect(coordinator.save("latest")).rejects.toThrow("disk full");
    expect(coordinator.snapshot().state).toBe("pending");
    await coordinator.retry();
    expect(attempts).toBe(2);
    expect(coordinator.snapshot()).toEqual({ state: "saved", error: null });
  });
});
