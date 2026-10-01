import type { Achievement } from '../data/achievements';
import type { Compound } from '../data/compounds';
import { CATEGORY_LABELS, ELEMENTS_BY_SYMBOL, type ChemicalElement } from '../data/elements';

function withArticle(noun: string): string {
  return `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;
}

/** "A", "A and B", "A, B and C". */
function listNames(names: string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

export type SageTag = 'Notice' | 'Answer' | 'Confirmed' | 'Understood' | 'Warning';

export interface ScriptedLine {
  tag: SageTag;
  text: string;
}

export const SAGE_TAGS: SageTag[] = ['Notice', 'Answer', 'Confirmed', 'Understood', 'Warning'];

/** Spoken readings of the kanji tags (告, 解, 確認, 了解, 警告). */
export const SPOKEN_TAGS: Record<SageTag, string> = { Notice: 'Koku', Answer: 'Kai', Confirmed: 'Kakunin', Understood: 'Ryoukai', Warning: 'Keikoku' };

/** Exactly what gets sent to text-to-speech for a line. */
export function spokenText(line: ScriptedLine): string {
  return `${SPOKEN_TAGS[line.tag]}. ${line.text}`;
}

/**
 * Every scripted line Zariah can say. scripts/prerender-voices.ts enumerates these
 * to pre-record clips, so any line built here is covered by the static voice pack.
 */
export const LINES = {
  greetNew: (): ScriptedLine => ({ tag: 'Notice', text: "Hello! I'm Zariah, your little lab scientist. Let's mix some atoms and make cool stuff together!" }),
  greetReturning: (): ScriptedLine => ({ tag: 'Notice', text: "Yay, you're back! Our lab missed you." }),
  voicePreview: (): ScriptedLine => ({ tag: 'Notice', text: "Hi! I'm Zariah. Do you like my voice?" }),
  analyze: (element: ChemicalElement): ScriptedLine => ({
    tag: 'Notice',
    text: `Ooh, ${element.name}! It's ${withArticle(CATEGORY_LABELS[element.category].toLowerCase())}, atom number ${element.number}.`,
  }),
  possible: (compound: Compound, known: boolean): ScriptedLine => ({
    tag: 'Answer',
    text: known
      ? `We can make ${compound.name}! Should we mix it?`
      : `Ooh! I think we can make something new: ${compound.name}! Should we mix it?`,
  }),
  partial: (compound: Compound, missing: Record<string, number>): ScriptedLine => ({
    tag: 'Notice',
    text: `So close! To make ${compound.name}, we just need more ${listNames(Object.keys(missing).map((symbol) => ELEMENTS_BY_SYMBOL[symbol]?.name ?? symbol))}.`,
  }),
  success: (compound: Compound): ScriptedLine => ({ tag: 'Confirmed', text: `Yay, it worked! We made ${compound.name}!` }),
  fact: (compound: Compound): ScriptedLine => ({ tag: 'Notice', text: compound.fact }),
  again: (compound: Compound): ScriptedLine => ({ tag: 'Understood', text: `${compound.name} again! It's already in our notebook, hehe.` }),
  nobleGas: (): ScriptedLine => ({ tag: 'Answer', text: "Oopsie! Noble gases are super shy. They don't like to hold hands with other atoms." }),
  failed: (): ScriptedLine => ({ tag: 'Answer', text: "Hmm, nothing happened. These atoms don't want to stick together. Let's try another mix!" }),
  badge: (achievement: Achievement): ScriptedLine => ({ tag: 'Notice', text: `Wow! You earned a new badge: ${achievement.title}!` }),
  potFull: (): ScriptedLine => ({ tag: 'Warning', text: "Whoa, the pot is too full! Let's mix it or empty it first." }),
  cancelled: (): ScriptedLine => ({ tag: 'Understood', text: "Okay! We'll wait. Take your time." }),
};

/** Stable short id for a clip, shared by the generator script and the game. */
export function clipId(voiceId: number, spoken: string): string {
  let hash = 0x811c9dc5;
  const input = `${voiceId}|${spoken}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
