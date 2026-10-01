import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { CursorSource, CursorState } from './cursor';

const ASSET_BASE = `${import.meta.env.BASE_URL}mediapipe`;

const MAX_HANDS = 2;
/** Fraction of the camera frame (centred) that maps to the full screen, so users need not reach the edges. */
const ACTIVE_REGION = 0.6;
/** Pinch ratio = thumb-to-index distance / palm length. Hysteresis avoids flicker. */
const PINCH_ON = 0.36;
const PINCH_OFF = 0.55;
/** While the fingers are closing in on a pinch the cursor barely moves, so it stays on the tile being aimed at. */
const PINCH_APPROACH = 0.75;
/** Consecutive open frames needed before a held atom is let go, so one bad frame does not drop it. */
const RELEASE_FRAMES = 3;
const LOST_HAND_MS = 400;

const THUMB_TIP = 4;
const INDEX_TIP = 8;
const WRIST = 0;
const MIDDLE_MCP = 9;

export interface HandSlot {
  readonly cursor: CursorState;
  landmarks: NormalizedLandmark[] | null;
  pinchRatio: number;
  lastSeen: number;
  openFrames: number;
}

interface Detection {
  landmarks: NormalizedLandmark[];
  x: number;
  y: number;
}

export class HandTracker implements CursorSource {
  readonly slots: HandSlot[] = Array.from({ length: MAX_HANDS }, (_, i) => ({
    cursor: { id: `hand-${i}`, x: 0, y: 0, pressed: false, visible: false },
    landmarks: null,
    pinchRatio: 1,
    lastSeen: 0,
    openFrames: 0,
  }));
  readonly cursors = this.slots.map((slot) => slot.cursor);
  readonly video: HTMLVideoElement;

  private landmarker: HandLandmarker | null = null;
  private stream: MediaStream | null = null;
  private frameHandle = 0;
  private lastVideoTime = -1;
  private disposed = false;

  constructor() {
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.muted = true;
  }

  async start(): Promise<void> {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera needs a secure context (open the game on localhost or over HTTPS).');
    }

    const [stream, landmarker] = await Promise.all([
      navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      }),
      this.createLandmarker(),
    ]);

    if (this.disposed) {
      stream.getTracks().forEach((track) => track.stop());
      landmarker.close();
      return;
    }

    this.stream = stream;
    this.landmarker = landmarker;
    this.video.srcObject = stream;
    await this.video.play();
    this.loop();
  }

  private async createLandmarker(): Promise<HandLandmarker> {
    const fileset = await FilesetResolver.forVisionTasks(`${ASSET_BASE}/wasm`);
    const options = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath: `${ASSET_BASE}/hand_landmarker.task`, delegate },
      runningMode: 'VIDEO' as const,
      numHands: MAX_HANDS,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    try {
      return await HandLandmarker.createFromOptions(fileset, options('GPU'));
    } catch {
      return HandLandmarker.createFromOptions(fileset, options('CPU'));
    }
  }

  private loop = () => {
    if (this.disposed) return;
    this.frameHandle = requestAnimationFrame(this.loop);
    const { video, landmarker } = this;
    if (!landmarker || video.readyState < 2 || video.currentTime === this.lastVideoTime) {
      this.checkLost();
      return;
    }
    this.lastVideoTime = video.currentTime;

    const result = landmarker.detectForVideo(video, performance.now());
    const detections = (result.landmarks ?? []).map((landmarks) => ({ landmarks, ...this.cursorTarget(landmarks) }));
    this.assign(detections).forEach((detection, index) => {
      if (detection) this.update(this.slots[index], detection);
    });
    this.checkLost();
  };

  /**
   * Matches detections to slots so each physical hand keeps its own cursor (and the atom it is holding).
   * Visible slots claim their nearest detection first; leftovers go to free slots, left-most hand first.
   */
  private assign(detections: Detection[]): (Detection | null)[] {
    const assigned: (Detection | null)[] = this.slots.map(() => null);
    const remaining = [...detections];

    const pairs: { slot: number; detection: Detection; distance: number }[] = [];
    this.slots.forEach((slot, index) => {
      if (!slot.cursor.visible) return;
      for (const detection of remaining) {
        pairs.push({ slot: index, detection, distance: Math.hypot(detection.x - slot.cursor.x, detection.y - slot.cursor.y) });
      }
    });
    pairs.sort((a, b) => a.distance - b.distance);
    for (const { slot, detection } of pairs) {
      if (assigned[slot] || !remaining.includes(detection)) continue;
      assigned[slot] = detection;
      remaining.splice(remaining.indexOf(detection), 1);
    }

    remaining.sort((a, b) => a.x - b.x);
    for (const detection of remaining) {
      const free = this.slots.findIndex((slot, index) => !assigned[index] && !slot.cursor.visible);
      if (free >= 0) assigned[free] = detection;
    }
    return assigned;
  }

  private cursorTarget(hand: NormalizedLandmark[]) {
    const thumb = hand[THUMB_TIP];
    const index = hand[INDEX_TIP];
    // Mirror horizontally so moving your hand right moves the cursor right.
    const half = ACTIVE_REGION / 2;
    const midX = 1 - (thumb.x + index.x) / 2;
    const midY = (thumb.y + index.y) / 2;
    return { x: clamp((midX - 0.5) / half, -1, 1), y: clamp(-(midY - 0.5) / half, -1, 1) };
  }

  private checkLost() {
    const now = performance.now();
    for (const slot of this.slots) {
      if (slot.cursor.visible && now - slot.lastSeen > LOST_HAND_MS) {
        slot.cursor.visible = false;
        slot.cursor.pressed = false;
        slot.landmarks = null;
        slot.openFrames = 0;
      }
    }
  }

  private update(slot: HandSlot, detection: Detection) {
    const hand = detection.landmarks;
    const { cursor } = slot;
    slot.lastSeen = performance.now();
    slot.landmarks = hand;

    const aspect = this.video.videoWidth / Math.max(1, this.video.videoHeight);
    const dist = (a: NormalizedLandmark, b: NormalizedLandmark) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
    const palm = Math.max(1e-4, dist(hand[WRIST], hand[MIDDLE_MCP]));
    slot.pinchRatio = dist(hand[THUMB_TIP], hand[INDEX_TIP]) / palm;

    if (cursor.pressed) {
      slot.openFrames = slot.pinchRatio > PINCH_OFF ? slot.openFrames + 1 : 0;
      if (slot.openFrames >= RELEASE_FRAMES) cursor.pressed = false;
    } else if (slot.pinchRatio < PINCH_ON) {
      cursor.pressed = true;
      slot.openFrames = 0;
    }

    if (!cursor.visible) {
      cursor.x = detection.x;
      cursor.y = detection.y;
      cursor.visible = true;
      return;
    }

    // Adaptive smoothing: steady when still, responsive when moving fast, nearly frozen while a pinch closes.
    const speed = Math.hypot(detection.x - cursor.x, detection.y - cursor.y);
    const closing = !cursor.pressed && slot.pinchRatio < PINCH_APPROACH && speed < 0.12;
    const alpha = closing ? 0.06 : clamp(0.18 + speed * 4, 0.18, 0.85);
    cursor.x += (detection.x - cursor.x) * alpha;
    cursor.y += (detection.y - cursor.y) * alpha;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameHandle);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.landmarker?.close();
    this.landmarker = null;
    for (const slot of this.slots) {
      slot.cursor.visible = false;
      slot.cursor.pressed = false;
      slot.landmarks = null;
    }
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
