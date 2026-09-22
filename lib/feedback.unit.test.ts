import { describe, expect, it, vi } from "vitest";
import { triggerFeedback } from "./feedback";

describe("feedback helper", () => {
  it("vibrates and plays a tone for notifications", () => {
    const vibrate = vi.fn();
    const AudioContextMock = vi.fn().mockImplementation(() => ({
      createOscillator: () => ({
        connect: vi.fn(),
        frequency: { setValueAtTime: vi.fn() },
        type: "sine",
        start: vi.fn(),
        stop: vi.fn(),
      }),
      createGain: () => ({
        connect: vi.fn(),
        gain: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      }),
      destination: {},
    }));

    Object.defineProperty(globalThis.navigator, "vibrate", {
      value: vibrate,
      configurable: true,
    });

    globalThis.AudioContext = AudioContextMock;

    triggerFeedback("notification");

    expect(vibrate).toHaveBeenCalled();
    expect(AudioContextMock).toHaveBeenCalled();
  });

  it("supports mode switches without throwing", () => {
    const vibrate = vi.fn();
    Object.defineProperty(globalThis.navigator, "vibrate", {
      value: vibrate,
      configurable: true,
    });
    globalThis.AudioContext = undefined;

    expect(() => triggerFeedback("mode")).not.toThrow();
  });
});
