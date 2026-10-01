import { DEFAULT_VOICE_ID, ZARIAH_VOICES } from '../src/voice/voices.js';

export interface SageEnv {
  GEMINI_API_KEY?: string;
  /** Base URL of a VOICEVOX engine, e.g. http://127.0.0.1:50021 locally or a hosted engine in production. */
  VOICEVOX_URL?: string;
}

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const TEXT_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-flash-latest'];
const TTS_MODELS = ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts', 'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts'];
const TTS_VOICE = 'Leda';
// The TTS model reads plain-prose instructions aloud; this profile/notes/transcript layout keeps them silent.
const VOICE_DIRECTION = `# AUDIO PROFILE: The Little Lab Scientist
A real little child, a Japanese girl about 8 years old, playing scientist and speaking English. She loves experiments and gets excited about every discovery.

### DIRECTOR'S NOTES
Sound like a young child, not an adult: a small, high-pitched, light and sweet kid's voice, slightly uneven and eager pacing, bubbly and curious, smiling while she talks. Gentle giggles on "hehe", happy little gasps on "ooh" and "wow". Strong but clear Japanese accent and Japanese intonation: pure, even vowels, syllable-timed rhythm, playful rising and falling pitch. Warm and encouraging, never loud or shouty. The first word is Japanese (Koku, Kai, Kakunin, Ryoukai or Keikoku): say it with native Japanese pronunciation, then a short pause.

#### TRANSCRIPT
`;

/** Japanese readings so VOICEVOX does not spell these out letter by letter. */
const VOICEVOX_READINGS: [RegExp, string][] = [
  [/^Koku\b/, 'こく'],
  [/^Kai\b/, 'かい'],
  [/^Kakunin\b/, 'かくにん'],
  [/^Ryoukai\b/, 'りょうかい'],
  [/^Keikoku\b/, 'けいこく'],
  [/\bZariah\b/gi, 'ザライア'],
  [/\bhehe\b/gi, 'えへへ'],
  [/\booh\b/gi, 'おお'],
  [/\bwow\b/gi, 'わあ'],
  [/\bwhoa\b/gi, 'わあっ'],
  [/\bhmm\b/gi, 'うーん'],
  [/\boopsie\b/gi, 'おっと'],
];

const SAGE_PERSONA = `You are Zariah, a cute, cheerful little scientist who helps the player in "Element Lab", a chemistry game for children and students.
You are curious, bubbly and kind, and you get excited about atoms ("Ooh!", "Wow!", "hehe"). Say "we" and "let's" as if you are doing the experiment together. No emojis. At most two short sentences (under 30 words).
Use simple words a 10-year-old understands, explain any science term in plain language with a fun comparison, and always be encouraging, never discouraging.
Choose one tag: Notice, Answer, Confirmed, Understood or Warning. Use the player's history when it is relevant, e.g. recurring mistakes, streaks, or progress since earlier sessions.
Reply as JSON: {"tag": "...", "text": "..."}. Do not repeat the tag inside text.`;

/** Clips never change for a given voice and text, so browsers and the Vercel CDN can keep them forever. */
const AUDIO_CACHE = 'public, max-age=31536000, s-maxage=31536000, immutable';

type GeminiResult = { candidates?: { content?: { parts?: { text?: string; inlineData?: { data: string; mimeType: string } }[] } }[] };

/** Tries each model in turn, moving on when one is overloaded or unavailable. */
async function gemini(apiKey: string, models: string[], body: unknown): Promise<GeminiResult> {
  let lastError: unknown;
  for (const model of models) {
    const response = await fetch(`${GEMINI_URL}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    });
    if (response.ok) return (await response.json()) as GeminiResult;
    lastError = new Error(`Gemini ${model} ${response.status}: ${await response.text()}`);
    if (![404, 429, 500, 503].includes(response.status)) break;
  }
  throw lastError;
}

/** WAV from VOICEVOX, or null when no engine is configured or reachable so Gemini can take over. */
export async function voicevox(baseUrl: string | undefined, text: string, speaker: number): Promise<ArrayBuffer | null> {
  if (!baseUrl) return null;
  const spoken = VOICEVOX_READINGS.reduce((result, [pattern, reading]) => result.replace(pattern, reading), text);
  try {
    const query = await fetch(`${baseUrl}/audio_query?speaker=${speaker}&text=${encodeURIComponent(spoken)}`, { method: 'POST' });
    if (!query.ok) return null;
    const settings = { ...(await query.json()), speedScale: 1.05, intonationScale: 1.25, prePhonemeLength: 0.05 };
    const audio = await fetch(`${baseUrl}/synthesis?speaker=${speaker}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(settings),
    });
    return audio.ok ? await audio.arrayBuffer() : null;
  } catch {
    return null;
  }
}

const fail = (status: number, message: string) => new Response(message, { status });

/** GET /api/sage/tts?voice=<id>&text=<line> → WAV audio. */
export async function handleTts(request: Request, env: SageEnv): Promise<Response> {
  const url = new URL(request.url);
  const text = url.searchParams.get('text')?.slice(0, 400);
  if (!text) return fail(400, 'Missing text');
  const requested = Number(url.searchParams.get('voice'));
  const speaker = ZARIAH_VOICES.some((voice) => voice.id === requested) ? requested : DEFAULT_VOICE_ID;

  try {
    const local = await voicevox(env.VOICEVOX_URL, text, speaker);
    if (local) return new Response(local, { headers: { 'content-type': 'audio/wav', 'cache-control': AUDIO_CACHE } });

    if (!env.GEMINI_API_KEY) return fail(503, 'No VOICEVOX engine and no GEMINI_API_KEY configured');
    const result = await gemini(env.GEMINI_API_KEY, TTS_MODELS, {
      contents: [{ parts: [{ text: VOICE_DIRECTION + text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } } },
      },
    });
    const audio = result.candidates?.[0]?.content?.parts?.find((part) => part.inlineData)?.inlineData;
    if (!audio) throw new Error('No audio returned');
    return new Response(Buffer.from(audio.data, 'base64'), { headers: { 'content-type': audio.mimeType, 'cache-control': AUDIO_CACHE } });
  } catch (error) {
    console.error('[sage tts]', error);
    return fail(502, String(error));
  }
}

/** POST /api/sage/line {event, memory} → {tag, text} written by Gemini in Zariah's voice. */
export async function handleLine(request: Request, env: SageEnv): Promise<Response> {
  if (request.method !== 'POST') return fail(405, 'Use POST');
  if (!env.GEMINI_API_KEY) return fail(503, 'GEMINI_API_KEY is not set');
  try {
    const { event, memory } = (await request.json()) as { event?: string; memory?: string };
    if (!event) return fail(400, 'Missing event');
    const result = await gemini(env.GEMINI_API_KEY, TEXT_MODELS, {
      systemInstruction: { parts: [{ text: SAGE_PERSONA }] },
      contents: [{ role: 'user', parts: [{ text: `Player history:\n${(memory ?? '').slice(0, 6000) || '(none yet)'}\n\nCurrent event: ${event.slice(0, 500)}` }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.8 },
    });
    const text = result.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
    return new Response(text, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('[sage line]', error);
    return fail(502, String(error));
  }
}
