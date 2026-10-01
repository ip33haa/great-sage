import { create } from 'zustand';
import { ACHIEVEMENTS } from '../data/achievements';
import { COMPOUNDS_BY_ID } from '../data/compounds';
import { isNobleGas, type ChemicalElement } from '../data/elements';
import { matchRecipe } from '../logic/recipeMatcher';
import { useLabStore } from '../store/labStore';
import { clipId, LINES, SAGE_TAGS, SPOKEN_TAGS, spokenText, type SageTag, type ScriptedLine } from './lines';
import { SageMemory } from './sageMemory';

export type { SageTag } from './lines';

export interface SageLine {
  id: number;
  tag: SageTag;
  text: string;
}

export interface SagePrompt {
  compoundId: string;
  name: string;
}

export interface SageCinematic {
  id: number;
  title: string;
  subtitle: string;
}

interface SageState {
  current: SageLine | null;
  /** A pending "Execute synthesis? YES / NO" question, shown until answered or the reactor changes. */
  prompt: SagePrompt | null;
  /** Full-screen golden "skill activated" moment, cleared by the overlay once it has played. */
  cinematic: SageCinematic | null;
}

export const useSageStore = create<SageState>(() => ({ current: null, prompt: null, cinematic: null }));

let cinematicId = 0;
export function showCinematic(title: string, subtitle: string) {
  useSageStore.setState({ cinematic: { id: ++cinematicId, title, subtitle } });
}

const PREFERRED_VOICES = [/Nanami/i, /Haruka/i, /Ayumi/i, /Google 日本語/i, /Kyoko/i, /Aria/i, /Jenny/i, /Sonia/i, /Libby/i, /Zira/i, /Google UK English Female/i, /Samantha/i, /Female/i];
const MAX_QUEUE = 4;
const MATCH_DEBOUNCE_MS = 700;
const HINT_DEBOUNCE_MS = 1600;
const HIDE_AFTER_MS = 2200;
const GEMINI_VOICE_WAIT_MS = 9000;
const VOICE_CACHE = 'sage-voice-v8';

/** Clip ids pre-recorded per voice by scripts/prerender-voices.ts, served from /voices/<voice>/. */
const voicePacks = new Map<number, Promise<Set<string>>>();
function voicePack(voiceId: number) {
  let pack = voicePacks.get(voiceId);
  if (!pack) {
    pack = fetch(`/voices/${voiceId}/index.json`)
      .then((response) => (response.ok ? response.json() : []))
      .then((ids: string[]) => new Set(ids))
      .catch(() => new Set<string>());
    voicePacks.set(voiceId, pack);
  }
  return pack;
}

/**
 * Pre-recorded clip if the voice pack has this line, otherwise live speech from /api/sage/tts
 * (VOICEVOX locally, Gemini in production). Live clips are kept in Cache Storage so repeats are instant.
 */
async function fetchVoice(text: string): Promise<ArrayBuffer | null> {
  const voiceId = useLabStore.getState().voiceId;
  const id = clipId(voiceId, text);
  const packed = (await voicePack(voiceId)).has(id);
  const url = packed ? `/voices/${voiceId}/${id}.mp3` : `/api/sage/tts?voice=${voiceId}&text=${encodeURIComponent(text)}`;
  try {
    const cache = 'caches' in window ? await caches.open(VOICE_CACHE) : null;
    const cached = await cache?.match(url);
    if (cached) return await cached.arrayBuffer();
    const response = await fetch(url);
    if (!response.ok) return null;
    await cache?.put(url, response.clone());
    return await response.arrayBuffer();
  } catch {
    return null;
  }
}

/**
 * Zariah, the cute lab-scientist narrator: short, prefixed lines
 * (Notice / Answer / Confirmed ...), a system chime before each one, and a YES/NO
 * prompt when a synthesis becomes possible. Lines are spoken with the Web Speech API
 * and mirrored into `useSageStore` for the on-screen box.
 */
export class SageAnnouncer {
  private queue: SageLine[] = [];
  private speaking = false;
  private nextId = 0;
  private voice: SpeechSynthesisVoice | null = null;
  private audio: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private readonly voiceClips = new Map<number, Promise<ArrayBuffer | null>>();
  private readonly memory = new SageMemory();
  private hideTimer = 0;
  private fallbackTimer = 0;
  private matchTimer = 0;
  private hintTimer = 0;
  private lastMatchId: string | null = null;
  private lastHintKey: string | null = null;
  private readonly analysed = new Set<string>();
  private readonly unsubscribe: () => void;
  private readonly synth: SpeechSynthesis | null = 'speechSynthesis' in window ? window.speechSynthesis : null;

  constructor() {
    this.pickVoice();
    this.synth?.addEventListener('voiceschanged', this.pickVoice);

    this.unsubscribe = useLabStore.subscribe((state, previous) => {
      if (state.lastReaction && state.lastReaction !== previous.lastReaction) {
        this.clearPrompt();
        const event = state.lastReaction;
        if (event.kind === 'success' && event.compoundId) {
          const compound = COMPOUNDS_BY_ID[event.compoundId];
          this.lastMatchId = null;
          if (event.isNew) {
            showCinematic(`We made "${compound.name}"!`, 'A brand new discovery for your lab notebook!');
            this.say(LINES.success(compound));
            this.say(LINES.fact(compound));
            this.memory.record(`Discovered ${compound.name} (${Object.keys(state.discovered).length} compounds known).`);
            this.askSage(`The player just discovered ${compound.name} for the first time. Remark on their progress, or suggest what to explore next.`);
          } else {
            this.say(LINES.again(compound));
            this.memory.record(`Synthesized ${compound.name} again.`);
          }
        } else {
          const materials = Object.entries(previous.reactor).map(([symbol, count]) => `${count}x ${symbol}`).join(', ');
          if (Object.keys(previous.reactor).some(isNobleGas)) {
            this.say(LINES.nobleGas());
          } else {
            this.say(LINES.failed());
          }
          this.memory.record(`Failed synthesis with ${materials}.`);
        }
      }

      for (const id of Object.keys(state.achievements)) {
        if (previous.achievements[id]) continue;
        const achievement = ACHIEVEMENTS.find((a) => a.id === id);
        if (achievement) {
          showCinematic(`You earned the "${achievement.title}" badge!`, achievement.description);
          this.say(LINES.badge(achievement));
          this.memory.record(`Earned the title "${achievement.title}".`);
        }
      }

      if (state.toasts.length > previous.toasts.length && state.toasts.at(-1)?.title === 'Reactor full') {
        this.say(LINES.potFull());
      }

      if (state.reactor !== previous.reactor) this.onReactorChanged();
      if (state.voiceEnabled !== previous.voiceEnabled && !state.voiceEnabled) this.stopSpeech();
    });
  }

  greet() {
    this.audio ??= new AudioContext();
    void this.audio.resume();
    const returning = this.memory.isReturning;
    this.memory.startSession();
    showCinematic(
      returning ? 'Welcome back to the lab!' : 'The lab is open!',
      "Let's do some science together!",
    );
    if (returning) {
      this.say(LINES.greetReturning());
      this.askSage('The player has returned for a new session. Welcome them back by referencing what they did before.');
    } else {
      this.say(LINES.greetNew());
    }
  }

  /** Asks Gemini for a memory-aware line; silently does nothing if the API is unavailable. */
  private async askSage(event: string) {
    try {
      const response = await fetch('/api/sage/line', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event, memory: this.memory.summary() }),
      });
      if (!response.ok) return;
      const line = (await response.json()) as { tag?: string; text?: string };
      const tag = SAGE_TAGS.find((t) => t === line.tag) ?? 'Notice';
      if (line.text) this.say({ tag, text: line.text.trim() });
    } catch {
      // Offline or no key: the scripted lines are enough.
    }
  }

  private stopSpeech() {
    this.synth?.cancel();
    try {
      this.source?.stop();
    } catch {
      // Already stopped.
    }
    this.source = null;
  }

  /** Brief analysis the first time each element is picked up, skipped if Zariah is already talking. */
  analyzeElement(element: ChemicalElement) {
    if (this.analysed.has(element.symbol) || this.speaking || this.queue.length > 0) return;
    this.analysed.add(element.symbol);
    this.say(LINES.analyze(element));
  }

  answer(yes: boolean) {
    const prompt = useSageStore.getState().prompt;
    if (!prompt) return;
    this.clearPrompt();
    if (yes) {
      useLabStore.getState().react();
    } else {
      this.say(LINES.cancelled());
    }
  }

  private clearPrompt() {
    useSageStore.setState({ prompt: null });
    if (!this.speaking) this.scheduleHide();
  }

  /** Waits for the player to pause, so several quick drops produce a single analysis. */
  private onReactorChanged() {
    clearTimeout(this.matchTimer);
    clearTimeout(this.hintTimer);

    const result = matchRecipe(useLabStore.getState().reactor);
    const prompt = useSageStore.getState().prompt;
    if (prompt && (result.kind !== 'exact' || result.compound.id !== prompt.compoundId)) this.clearPrompt();

    if (result.kind === 'exact') {
      this.matchTimer = window.setTimeout(() => {
        if (result.compound.id === this.lastMatchId) return;
        this.lastMatchId = result.compound.id;
        this.lastHintKey = null;
        const known = !!useLabStore.getState().discovered[result.compound.id];
        this.say(LINES.possible(result.compound, known));
        useSageStore.setState({ prompt: { compoundId: result.compound.id, name: result.compound.name } });
      }, MATCH_DEBOUNCE_MS);
      return;
    }

    this.lastMatchId = null;
    if (result.kind === 'partial') {
      const hint = LINES.partial(result.compound, result.missing);
      this.hintTimer = window.setTimeout(() => {
        if (hint.text === this.lastHintKey || this.speaking) return;
        this.lastHintKey = hint.text;
        this.say(hint);
      }, HINT_DEBOUNCE_MS);
    }
  }

  say(scripted: ScriptedLine) {
    const line = { id: ++this.nextId, ...scripted };
    this.queue.push(line);
    if (useLabStore.getState().voiceEnabled) this.voiceClips.set(line.id, fetchVoice(spokenText(line)));
    if (this.queue.length > MAX_QUEUE) {
      for (const dropped of this.queue.splice(0, this.queue.length - MAX_QUEUE)) this.voiceClips.delete(dropped.id);
    }
    if (!this.speaking) this.next();
  }

  private scheduleHide() {
    clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => {
      if (!this.speaking) useSageStore.setState({ current: null });
    }, HIDE_AFTER_MS);
  }

  private next = () => {
    clearTimeout(this.fallbackTimer);
    const line = this.queue.shift();
    if (!line) {
      this.speaking = false;
      this.scheduleHide();
      return;
    }

    this.speaking = true;
    clearTimeout(this.hideTimer);
    useSageStore.setState({ current: line });

    const readingMs = Math.max(2200, line.text.length * 55);
    const enabled = useLabStore.getState().voiceEnabled;
    const clip = this.voiceClips.get(line.id);
    this.voiceClips.delete(line.id);
    if (enabled) this.chime(line.tag);
    if (!enabled || (!this.synth && !clip)) {
      this.fallbackTimer = window.setTimeout(this.next, readingMs);
      return;
    }

    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(this.fallbackTimer);
      window.setTimeout(this.next, 300);
    };

    if (clip) {
      this.fallbackTimer = window.setTimeout(done, GEMINI_VOICE_WAIT_MS + readingMs + 6000);
      const timeout = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), GEMINI_VOICE_WAIT_MS));
      void Promise.race([clip, timeout]).then(async (data) => {
        if (finished) return;
        const ctx = this.audio;
        const buffer = data && ctx ? await ctx.decodeAudioData(data.slice(0)).catch(() => null) : null;
        if (finished) return;
        if (!buffer || !ctx || !useLabStore.getState().voiceEnabled) {
          this.speakWithBrowser(line, done);
          return;
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.onended = () => {
          if (this.source === source) this.source = null;
          done();
        };
        this.source = source;
        source.start(ctx.currentTime + 0.22);
      });
      return;
    }

    this.fallbackTimer = window.setTimeout(done, readingMs + 6000);
    this.speakWithBrowser(line, done);
  };

  private speakWithBrowser(line: SageLine, done: () => void) {
    if (!this.synth) {
      window.setTimeout(done, Math.max(2200, line.text.length * 55));
      return;
    }
    // Speaking the tag on its own gives the clipped "Notice. <pause> ..." cadence.
    const tag = this.utterance(`${SPOKEN_TAGS[line.tag]}.`, 0.92);
    const body = this.utterance(line.text, 1.0);
    body.onend = done;
    body.onerror = done;
    window.setTimeout(() => {
      this.synth?.speak(tag);
      this.synth?.speak(body);
    }, 220);
  }

  private utterance(text: string, rate: number) {
    const utterance = new SpeechSynthesisUtterance(text);
    if (this.voice) utterance.voice = this.voice;
    utterance.lang = this.voice?.lang ?? 'en-US';
    utterance.rate = rate;
    utterance.pitch = 1.8;
    return utterance;
  }

  /** Short two-tone system chime; lower and harsher for warnings. */
  private chime(tag: SageTag) {
    const ctx = this.audio;
    if (!ctx || ctx.state !== 'running') return;
    const notes = tag === 'Warning' ? [440, 330] : tag === 'Answer' ? [988, 1319] : [1319, 1760];
    const type: OscillatorType = tag === 'Warning' ? 'square' : 'sine';
    notes.forEach((frequency, i) => {
      const start = ctx.currentTime + i * 0.09;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(tag === 'Warning' ? 0.04 : 0.07, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.3);
    });
  }

  private pickVoice = () => {
    const voices = this.synth?.getVoices().filter((voice) => /^(en|ja)/i.test(voice.lang)) ?? [];
    for (const pattern of PREFERRED_VOICES) {
      const match = voices.find((voice) => pattern.test(voice.name));
      if (match) {
        this.voice = match;
        return;
      }
    }
    this.voice = voices[0] ?? null;
  };

  dispose() {
    this.unsubscribe();
    this.synth?.removeEventListener('voiceschanged', this.pickVoice);
    this.stopSpeech();
    this.voiceClips.clear();
    void this.audio?.close();
    clearTimeout(this.hideTimer);
    clearTimeout(this.fallbackTimer);
    clearTimeout(this.matchTimer);
    clearTimeout(this.hintTimer);
    this.queue = [];
    useSageStore.setState({ current: null, prompt: null, cinematic: null });
  }
}
