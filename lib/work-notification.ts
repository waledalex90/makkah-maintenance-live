import { Howl } from "howler";

let howl: Howl | null = null;
let lastPlayAt = 0;
const DEBOUNCE_MS = 900;

/**
 * Short professional notification (single play, no loop).
 * Debounced so rapid realtime bursts do not stack.
 */
export function playWorkNotificationSound() {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastPlayAt < DEBOUNCE_MS) return;
  lastPlayAt = now;

  if (!howl) {
    howl = new Howl({
      src: ["/sounds/notification.mp3"],
      loop: false,
      volume: 0.82,
      html5: true,
    });
  }
  howl.stop();
  howl.play();
}
