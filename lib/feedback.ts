export type FeedbackType = "notification" | "mode";

function getAudioContextConstructor() {
  const candidateWindow = typeof window !== "undefined" ? window : undefined;
  const fromWindow = candidateWindow?.AudioContext || (candidateWindow as typeof window & { webkitAudioContext?: typeof AudioContext } | undefined)?.webkitAudioContext;
  const fromGlobal = (globalThis as typeof globalThis & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext;
  const fromWebkitGlobal = (globalThis as typeof globalThis & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return fromWindow || fromGlobal || fromWebkitGlobal || null;
}

function safeAudioContext(): AudioContext | null {
  const AudioCtor = getAudioContextConstructor();
  if (!AudioCtor) return null;

  try {
    return new AudioCtor();
  } catch {
    return null;
  }
}

export function triggerFeedback(type: FeedbackType = "notification") {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(type === "mode" ? [18, 28, 18] : [12, 28, 12]);
  }

  const AudioCtor = getAudioContextConstructor();
  if (!AudioCtor) return;

  try {
    const audioContext = safeAudioContext();
    if (!audioContext) return;

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = type === "mode" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(type === "mode" ? 340 : 620, audioContext.currentTime);

    gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(type === "mode" ? 0.045 : 0.03, audioContext.currentTime + 0.015);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + (type === "mode" ? 0.16 : 0.12));

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + (type === "mode" ? 0.18 : 0.13));
  } catch {
    // Ignore silent browser restrictions and autoplay policies.
  }
}
