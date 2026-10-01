export interface ZariahVoice {
  /** VOICEVOX style id. */
  id: number;
  label: string;
  /** Required credit line, "VOICEVOX:<character>". */
  credit: string;
}

/** Japanese girl voices from VOICEVOX that Zariah can use. */
export const ZARIAH_VOICES: ZariahVoice[] = [
  { id: 8, label: 'Tsumugi (cheerful girl)', credit: 'VOICEVOX:春日部つむぎ' },
  { id: 108, label: 'Kiritan (little girl)', credit: 'VOICEVOX:東北きりたん' },
  { id: 3, label: 'Zundamon (cute kid)', credit: 'VOICEVOX:ずんだもん' },
  { id: 1, label: 'Zundamon (sweet)', credit: 'VOICEVOX:ずんだもん' },
  { id: 45, label: 'Miko (tiny girl)', credit: 'VOICEVOX:櫻歌ミコ' },
  { id: 2, label: 'Metan (girl)', credit: 'VOICEVOX:四国めたん' },
  { id: 15, label: 'Sora (sweet girl)', credit: 'VOICEVOX:九州そら' },
  { id: 14, label: 'Himari (soft girl)', credit: 'VOICEVOX:冥鳴ひまり' },
  { id: 10, label: 'Hau (gentle girl)', credit: 'VOICEVOX:雨晴はう' },
  { id: 46, label: 'Sayo (cat girl)', credit: 'VOICEVOX:小夜/SAYO' },
  { id: 24, label: 'WhiteCUL (happy)', credit: 'VOICEVOX:WhiteCUL' },
];

export const DEFAULT_VOICE_ID = ZARIAH_VOICES[0].id;
