import { describe, it, expect, afterEach } from "vitest";
import { MOTION_KEY, installMotionEffects, motionEffectsOn, setMotionEffects } from "./useMotionEffects";

// «Κινούμενα εφέ»: on this device, on unless switched off.

afterEach(() => {
  localStorage.removeItem(MOTION_KEY);
  document.documentElement.removeAttribute("data-motion");
});

describe("moving effects", () => {
  it("is on by default, and says so on <html>", () => {
    expect(motionEffectsOn()).toBe(true);
    installMotionEffects();
    expect(document.documentElement.getAttribute("data-motion")).toBe("on");
  });

  it("switched off: stored on the device and applied at once; on again the same way", () => {
    setMotionEffects(false);
    expect(localStorage.getItem(MOTION_KEY)).toBe("off");
    expect(document.documentElement.getAttribute("data-motion")).toBe("off");
    expect(motionEffectsOn()).toBe(false);
    setMotionEffects(true);
    expect(motionEffectsOn()).toBe(true);
    expect(document.documentElement.getAttribute("data-motion")).toBe("on");
  });

  it("a later start reads what was chosen", () => {
    localStorage.setItem(MOTION_KEY, "off");
    installMotionEffects();
    expect(document.documentElement.getAttribute("data-motion")).toBe("off");
    // Anything but "off" is on.
    localStorage.setItem(MOTION_KEY, "garbage");
    expect(motionEffectsOn()).toBe(true);
  });
});
