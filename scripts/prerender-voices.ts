/**
 * Pre-records every scripted Zariah line with a local VOICEVOX engine into public/voices/<voice>/,
 * so the deployed site (where VOICEVOX cannot run) still speaks with the Japanese voice.
 *
 *   npm run voices                 # current default voice
 *   npm run voices -- --voice=108  # another voice from src/voice/voices.ts
 *   npm run voices -- --count      # only list how many lines there are
 */
import { Mp3Encoder } from '@breezystack/lamejs';
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ACHIEVEMENTS } from '../src/data/achievements.js';
import { COMPOUNDS } from '../src/data/compounds.js';
import { ELEMENTS } from '../src/data/elements.js';
import { matchRecipe } from '../src/logic/recipeMatcher.js';
import { clipId, LINES, spokenText, type ScriptedLine } from '../src/voice/lines.js';
import { DEFAULT_VOICE_ID, ZARIAH_VOICES } from '../src/voice/voices.js';
import { voicevox } from '../server/sage.js';

const VOICEVOX_URL = process.env.VOICEVOX_URL || 'http://127.0.0.1:50021';
const MP3_KBPS = 48;
const CONCURRENCY = 1;

const args = process.argv.slice(2);
const voiceArg = args.find((arg) => arg.startsWith('--voice='));
const voiceId = voiceArg ? Number(voiceArg.split('=')[1]) : DEFAULT_VOICE_ID;
if (!ZARIAH_VOICES.some((voice) => voice.id === voiceId)) throw new Error(`Unknown voice ${voiceId}`);

/** Every reactor state that can lead to a "So close!" hint: each partial sub-mix of each compound. */
function partialLines(): ScriptedLine[] {
  const lines: ScriptedLine[] = [];
  for (const compound of COMPOUNDS) {
    const entries = Object.entries(compound.composition);
    const visit = (index: number, reactor: Record<string, number>) => {
      if (index === entries.length) {
        const result = matchRecipe(reactor);
        if (result.kind === 'partial') lines.push(LINES.partial(result.compound, result.missing));
        return;
      }
      const [symbol, max] = entries[index];
      for (let n = 0; n <= max; n++) {
        const next = { ...reactor };
        if (n > 0) next[symbol] = n;
        visit(index + 1, next);
      }
    };
    visit(0, {});
  }
  return lines;
}

function allLines(): ScriptedLine[] {
  return [
    LINES.greetNew(),
    LINES.greetReturning(),
    LINES.voicePreview(),
    LINES.nobleGas(),
    LINES.failed(),
    LINES.potFull(),
    LINES.cancelled(),
    ...ELEMENTS.map(LINES.analyze),
    ...COMPOUNDS.flatMap((compound) => [
      LINES.possible(compound, true),
      LINES.possible(compound, false),
      LINES.success(compound),
      LINES.fact(compound),
      LINES.again(compound),
    ]),
    ...ACHIEVEMENTS.map(LINES.badge),
    ...partialLines(),
  ];
}

/** VOICEVOX returns 16-bit mono PCM WAV; finds the data chunk rather than assuming a 44-byte header. */
function wavToMp3(wav: ArrayBuffer): Uint8Array {
  const view = new DataView(wav);
  const sampleRate = view.getUint32(24, true);
  let offset = 12;
  while (offset < view.byteLength - 8) {
    const chunk = String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
    const size = view.getUint32(offset + 4, true);
    if (chunk === 'data') {
      const samples = new Int16Array(wav.slice(offset + 8, offset + 8 + size));
      const encoder = new Mp3Encoder(1, sampleRate, MP3_KBPS);
      const parts: Uint8Array[] = [];
      for (let i = 0; i < samples.length; i += 1152) parts.push(new Uint8Array(encoder.encodeBuffer(samples.subarray(i, i + 1152))));
      parts.push(new Uint8Array(encoder.flush()));
      const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
      let at = 0;
      for (const part of parts) {
        out.set(part, at);
        at += part.length;
      }
      return out;
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error('WAV has no data chunk');
}

async function main() {
  const spoken = [...new Set(allLines().map(spokenText))];
  console.log(`${spoken.length} unique lines for voice ${voiceId}`);
  if (args.includes('--count')) return;

  const dir = join('public', 'voices', String(voiceId));
  mkdirSync(dir, { recursive: true });
  const ids = spoken.map((text) => clipId(voiceId, text));
  const wanted = new Set(ids.map((id) => `${id}.mp3`));
  for (const file of readdirSync(dir)) {
    if (file.endsWith('.mp3') && !wanted.has(file)) unlinkSync(join(dir, file));
  }

  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < spoken.length) {
      const i = next++;
      const file = join(dir, `${ids[i]}.mp3`);
      if (!existsSync(file)) {
        const wav = await voicevox(VOICEVOX_URL, spoken[i], voiceId);
        if (!wav) throw new Error(`VOICEVOX failed at ${VOICEVOX_URL} (is the engine running?) for: ${spoken[i]}`);
        writeFileSync(file, wavToMp3(wav));
      }
      if (++done % 25 === 0 || done === spoken.length) console.log(`${done}/${spoken.length}`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  writeFileSync(join(dir, 'index.json'), JSON.stringify(ids));
  console.log(`Wrote ${dir}`);
}

void main();
