const STORAGE_KEY = 'great-sage-memory';
const MAX_EVENTS = 40;

interface MemoryData {
  sessions: number;
  lastSeen: number;
  events: { at: number; text: string }[];
}

/** Rolling log of what the player has done, persisted in localStorage and fed to Gemini as context. */
export class SageMemory {
  private data: MemoryData;

  constructor() {
    this.data = this.load();
  }

  get isReturning() {
    return this.data.sessions > 0;
  }

  startSession() {
    this.data.sessions += 1;
    this.save();
  }

  record(text: string) {
    this.data.events.push({ at: Date.now(), text });
    if (this.data.events.length > MAX_EVENTS) this.data.events.splice(0, this.data.events.length - MAX_EVENTS);
    this.save();
  }

  summary() {
    const lines = [`Session number ${this.data.sessions}.`];
    if (this.data.lastSeen) lines.push(`Last seen ${new Date(this.data.lastSeen).toLocaleString()}.`);
    for (const event of this.data.events) lines.push(`- ${new Date(event.at).toLocaleString()}: ${event.text}`);
    return lines.join('\n');
  }

  private load(): MemoryData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as MemoryData;
    } catch {
      // Corrupt or unavailable storage: start fresh.
    }
    return { sessions: 0, lastSeen: 0, events: [] };
  }

  private save() {
    this.data.lastSeen = Date.now();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Storage full or disabled; memory just won't persist.
    }
  }
}
