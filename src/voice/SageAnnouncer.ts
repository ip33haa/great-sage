import { create } from 'zustand';
import { ACHIEVEMENTS } from '../data/achievements';
import { COMPOUNDS_BY_ID } from '../data/compounds';
import { CATEGORY_LABELS, isNobleGas, type ChemicalElement } from '../data/elements';
import { describeMissing, matchRecipe } from '../logic/recipeMatcher';
import { useLabStore } from '../store/labStore';

export type SageTag = 'Notice' | 'Answer' | 'Confirmed' | 'Understood' | 'Warning';

export interface SageLine {
  id: number;
  tag: SageTag;
  text: string;
}

export interface SagePrompt {
  compoundId: string;
  name: string;
}

interface SageState {
  current: SageLine | null;
  /** A pending "Execute synthesis? YES / NO" question, shown until answered or the reactor changes. */
  prompt: SagePrompt | null;
}

export const useSageStore = create<SageState>(() => ({ current: null, prompt: null }));

const PREFERRED_VOICES = [/Aria/i, /Jenny/i, /Sonia/i, /Libby/i, /Zira/i, /Google UK English Female/i, /Samantha/i, /Female/i];
const MAX_QUEUE = 4;
const MATCH_DEBOUNCE_MS = 700;
const HINT_DEBOUNCE_MS = 1600;
const HIDE_AFTER_MS = 2200;

/**
 * Narrator in the manner of a "Great Sage" skill: flat, terse, prefixed lines
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
            this.say('Confirmed', `Synthesis successful. ${compound.name} acquired.`);
            this.say('Notice', compound.fact);
          } else {
            this.say('Understood', `${compound.name} synthesized. Already recorded.`);
          }
        } else if (Object.keys(previous.reactor).some(isNobleGas)) {
          this.say('Answer', 'Impossible. Noble gases reject bonding under these conditions.');
        } else {
          this.say('Answer', 'Synthesis failed. No stable compound exists for this combination.');
        }
      }

      for (const id of Object.keys(state.achievements)) {
        if (previous.achievements[id]) continue;
        const achievement = ACHIEVEMENTS.find((a) => a.id === id);
        if (achievement) this.say('Notice', `Title acquired: ${achievement.title}.`);
      }

      if (state.toasts.length > previous.toasts.length && state.toasts.at(-1)?.title === 'Reactor full') {
        this.say('Warning', 'Reactor capacity exceeded. Execute synthesis or clear the reactor.');
      }

      if (state.reactor !== previous.reactor) this.onReactorChanged();
      if (state.voiceEnabled !== previous.voiceEnabled && !state.voiceEnabled) this.synth?.cancel();
    });
  }

  greet() {
    this.audio ??= new AudioContext();
    void this.audio.resume();
    this.say('Notice', 'Unique skill, Great Sage, activated. Analysis of the periodic table is complete. Awaiting materials.');
  }

  /** Brief analysis the first time each element is picked up, skipped if the Sage is already talking. */
  analyzeElement(element: ChemicalElement) {
    if (this.analysed.has(element.symbol) || this.speaking || this.queue.length > 0) return;
    this.analysed.add(element.symbol);
    this.say('Notice', `Analysis complete. ${element.name}. ${CATEGORY_LABELS[element.category]}. Atomic number ${element.number}.`);
  }

  answer(yes: boolean) {
    const prompt = useSageStore.getState().prompt;
    if (!prompt) return;
    this.clearPrompt();
    if (yes) {
      useLabStore.getState().react();
    } else {
      this.say('Understood', 'Synthesis cancelled.');
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
        this.say(
          'Answer',
          known
            ? `Synthesis of ${result.compound.name} is possible.`
            : `Synthesis of an unrecorded compound, ${result.compound.name}, is possible.`,
        );
        useSageStore.setState({ prompt: { compoundId: result.compound.id, name: result.compound.name } });
      }, MATCH_DEBOUNCE_MS);
      return;
    }

    this.lastMatchId = null;
    if (result.kind === 'partial') {
      const key = `${result.compound.id}:${describeMissing(result.missing)}`;
      this.hintTimer = window.setTimeout(() => {
        if (key === this.lastHintKey || this.speaking) return;
        this.lastHintKey = key;
        this.say('Notice', `Insufficient materials. ${result.compound.name} requires ${describeMissing(result.missing)}.`);
      }, HINT_DEBOUNCE_MS);
    }
  }

  say(tag: SageTag, text: string) {
    this.queue.push({ id: ++this.nextId, tag, text });
    if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
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
    if (enabled) this.chime(line.tag);
    if (!this.synth || !enabled) {
      this.fallbackTimer = window.setTimeout(this.next, readingMs);
      return;
    }

    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      window.setTimeout(this.next, 300);
    };

    // Speaking the tag on its own gives the clipped "Notice. <pause> ..." cadence.
    const tag = this.utterance(`${line.tag}.`, 0.92);
    const body = this.utterance(line.text, 1.0);
    body.onend = done;
    body.onerror = done;
    this.fallbackTimer = window.setTimeout(done, readingMs + 6000);
    window.setTimeout(() => {
      this.synth?.speak(tag);
      this.synth?.speak(body);
    }, 220);
  };

  private utterance(text: string, rate: number) {
    const utterance = new SpeechSynthesisUtterance(text);
    if (this.voice) utterance.voice = this.voice;
    utterance.lang = this.voice?.lang ?? 'en-US';
    utterance.rate = rate;
    utterance.pitch = 0.9;
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
    const voices = this.synth?.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith('en')) ?? [];
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
    this.synth?.cancel();
    void this.audio?.close();
    clearTimeout(this.hideTimer);
    clearTimeout(this.fallbackTimer);
    clearTimeout(this.matchTimer);
    clearTimeout(this.hintTimer);
    this.queue = [];
    useSageStore.setState({ current: null, prompt: null });
  }
}
