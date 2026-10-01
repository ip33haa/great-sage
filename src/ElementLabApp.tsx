import { Atom, Camera, FlaskConical, Hand, Lock, Minus, MousePointer2, Plus, RotateCcw, Sparkles, Trash2, Trophy, Volume2, VolumeX, X, Zap } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ACHIEVEMENTS, type AchievementTier } from './data/achievements';
import { COMPOUNDS, MAX_REACTOR_ATOMS, prettyFormula } from './data/compounds';
import { CATEGORY_COLORS, CATEGORY_LABELS, ELEMENTS_BY_SYMBOL, type ChemicalElement, type ElementCategory } from './data/elements';
import { CombinedCursor } from './input/cursor';
import { HandTracker } from './input/HandTracker';
import { PointerFallback } from './input/PointerFallback';
import { describeMissing, matchRecipe } from './logic/recipeMatcher';
import { LabScene } from './scene/LabScene';
import { reactorAtomCount, useLabStore } from './store/labStore';
import { SkillCinematic } from './SkillCinematic';
import { SageAnnouncer, useSageStore, type SageTag } from './voice/SageAnnouncer';
import { LINES } from './voice/lines';
import { ZARIAH_VOICES } from './voice/voices';

/** Kanji prefixes for Zariah's announcements, in the style of anime system voices. */
const TAG_KANJI: Record<SageTag, string> = { Notice: '告', Answer: '解', Confirmed: '確認', Understood: '了解', Warning: '警告' };

type CameraStatus = 'idle' | 'loading' | 'active' | 'error';

const TIER_STYLES: Record<AchievementTier, string> = {
  bronze: 'text-amber-600 bg-amber-600/15 border-amber-600/40',
  silver: 'text-slate-200 bg-slate-200/10 border-slate-300/40',
  gold: 'text-yellow-300 bg-yellow-300/15 border-yellow-300/50',
};

type HandStatus = 'none' | 'open' | 'pinch';

/** Matches the per-hand cursor ring colours in the 3D scene. */
const HAND_COLORS = ['#67e8f9', '#f9a8d4'];

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

const ElementLabApp: React.FC = () => {
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const pointerRef = useRef<PointerFallback | null>(null);
  const [hovered, setHovered] = useState<ChemicalElement | null>(null);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle');
  const [cameraError, setCameraError] = useState('');
  const [started, setStarted] = useState(false);
  const setInputMode = useLabStore((s) => s.setInputMode);
  const voiceEnabled = useLabStore((s) => s.voiceEnabled);
  const setVoiceEnabled = useLabStore((s) => s.setVoiceEnabled);
  const voiceId = useLabStore((s) => s.voiceId);
  const setVoiceId = useLabStore((s) => s.setVoiceId);
  const sageRef = useRef<SageAnnouncer | null>(null);

  const begin = () => {
    if (!started) sageRef.current?.greet();
    setStarted(true);
  };

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;
    const pointer = new PointerFallback(host);
    pointerRef.current = pointer;
    const cursor = new CombinedCursor(() => [trackerRef.current, pointerRef.current]);
    const scene = new LabScene(host, cursor, {
      onHoverElement: setHovered,
      onPickUp: (element) => sageRef.current?.analyzeElement(element),
    });
    const sage = new SageAnnouncer();
    sageRef.current = sage;
    return () => {
      sage.dispose();
      sageRef.current = null;
      scene.dispose();
      pointer.dispose();
      trackerRef.current?.dispose();
      trackerRef.current = null;
    };
  }, []);

  const startCamera = async () => {
    begin();
    setCameraStatus('loading');
    setCameraError('');
    const tracker = new HandTracker();
    try {
      await tracker.start();
      trackerRef.current = tracker;
      setCameraStatus('active');
      setInputMode('hand');
    } catch (error) {
      tracker.dispose();
      setCameraStatus('error');
      setCameraError(error instanceof Error ? error.message : String(error));
      setInputMode('pointer');
    }
  };

  const stopCamera = () => {
    trackerRef.current?.dispose();
    trackerRef.current = null;
    setCameraStatus('idle');
    setInputMode('pointer');
  };

  return (
    <div className="w-screen h-screen flex bg-[#0b1020] text-slate-100 overflow-hidden select-none font-[Nunito,system-ui,sans-serif] text-[15px]">
      <div className="relative flex-1 min-w-0">
        <div ref={canvasHostRef} className="absolute inset-0" />

        <div className="pointer-events-none absolute top-4 left-4 flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl bg-slate-900/70 backdrop-blur px-3 py-2 border border-white/10">
            <Atom className="w-5 h-5 text-cyan-300" />
            <span className="font-black tracking-tight">Element Lab</span>
          </div>
          <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-slate-900/70 backdrop-blur px-3 py-2 border border-white/10 text-sm">
            {cameraStatus === 'active' ? (
              <>
                <Hand className="w-4 h-4 text-emerald-300" />
                <span>Hand tracking</span>
                <button onClick={stopCamera} className="ml-1 text-slate-400 hover:text-white" title="Stop camera">
                  <X className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <MousePointer2 className="w-4 h-4 text-sky-300" />
                <span>Mouse</span>
                <button
                  onClick={startCamera}
                  disabled={cameraStatus === 'loading'}
                  className="ml-1 flex items-center gap-1 rounded-md bg-cyan-500/20 px-2 py-0.5 text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-50"
                >
                  <Camera className="w-3.5 h-3.5" />
                  {cameraStatus === 'loading' ? 'Starting...' : 'Use camera'}
                </button>
              </>
            )}
          </div>
          <button
            onClick={() => setVoiceEnabled(!voiceEnabled)}
            className={`pointer-events-auto flex items-center gap-1.5 rounded-xl bg-slate-900/70 backdrop-blur px-3 py-2 border text-sm ${
              voiceEnabled ? 'border-cyan-400/40 text-cyan-200' : 'border-white/10 text-slate-400'
            }`}
            title={voiceEnabled ? "Mute Zariah's voice" : "Unmute Zariah's voice"}
          >
            {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            Zariah
          </button>
          <select
            value={voiceId}
            onChange={(event) => {
              setVoiceId(Number(event.target.value));
              if (started) sageRef.current?.say(LINES.voicePreview());
            }}
            className="pointer-events-auto rounded-xl bg-slate-900/70 backdrop-blur px-3 py-2 border border-white/10 text-sm font-bold text-amber-100 outline-none hover:border-amber-300/40"
            title="Choose Zariah's voice"
          >
            {ZARIAH_VOICES.map((voice) => (
              <option key={voice.id} value={voice.id} className="bg-slate-900">
                Voice: {voice.label}
              </option>
            ))}
          </select>
        </div>

        {hovered && <HoverCard element={hovered} />}
        <SageBox onAnswer={(yes) => sageRef.current?.answer(yes)} />
        <Toasts />
        {cameraStatus === 'active' && trackerRef.current && <CameraPreview tracker={trackerRef.current} />}
        {cameraStatus === 'error' && (
          <div className="absolute bottom-4 left-4 max-w-sm rounded-xl bg-red-950/80 border border-red-500/40 px-4 py-3 text-sm text-red-100">
            <div className="font-semibold mb-1">Camera unavailable, using mouse instead</div>
            <div className="text-red-200/80">{cameraError}</div>
          </div>
        )}

        {!started && <StartOverlay onCamera={startCamera} onMouse={begin} />}
        <SkillCinematic />
      </div>

      <SidePanel />
    </div>
  );
};

const StartOverlay: React.FC<{ onCamera: () => void; onMouse: () => void }> = ({ onCamera, onMouse }) => (
  <div className="absolute inset-0 z-20 flex items-center justify-center bg-[radial-gradient(circle,rgba(120,60,10,0.6),rgba(11,16,32,0.92))] backdrop-blur-sm p-4">
    <div className="max-w-xl rounded-3xl border-2 border-amber-300/50 bg-slate-900/90 p-8 shadow-[0_0_60px_rgba(251,191,36,0.25)]">
      <div className="flex items-center gap-3 mb-3">
        <div className="rounded-2xl bg-amber-300/20 p-2.5">
          <FlaskConical className="w-9 h-9 text-amber-300" />
        </div>
        <div>
          <h1 className="text-4xl font-black tracking-tight">Element Lab</h1>
          <div className="text-amber-200 font-bold">with Zariah, your little lab scientist</div>
        </div>
      </div>
      <p className="text-lg text-slate-200 mb-5">
        Everything around you is made of tiny <b className="text-amber-200">atoms</b>. Mix them together to make real things like water and salt!
      </p>
      <ol className="space-y-3 mb-7">
        {[
          ['1', 'Grab an atom', 'Pinch your thumb and pointer finger on a tile (or click it).'],
          ['2', 'Drop it in the pot', 'Let go over the glowing mixing pot.'],
          ['3', 'Mix it!', 'When Zariah says it can be made, press Yes.'],
        ].map(([n, title, text]) => (
          <li key={n} className="flex items-start gap-3 rounded-2xl bg-white/5 p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-300 text-lg font-black text-slate-900">{n}</span>
            <span>
              <span className="block font-extrabold text-white">{title}</span>
              <span className="text-slate-300">{text}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="flex gap-3">
        <button
          onClick={onCamera}
          className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-amber-300 px-4 py-4 text-lg font-black text-slate-950 shadow-lg transition hover:scale-[1.03] hover:bg-amber-200"
        >
          <Hand className="w-6 h-6" /> Play with my hands
        </button>
        <button
          onClick={onMouse}
          className="flex-1 flex items-center justify-center gap-2 rounded-2xl border-2 border-white/20 px-4 py-4 text-lg font-extrabold transition hover:scale-[1.03] hover:bg-white/10"
        >
          <MousePointer2 className="w-6 h-6" /> Use the mouse
        </button>
      </div>
      <p className="mt-4 text-sm text-slate-400">
        Your camera picture stays on this computer and is never sent anywhere.
      </p>
      <VoiceCredit />
    </div>
  </div>
);

const VoiceCredit: React.FC = () => {
  const voiceId = useLabStore((s) => s.voiceId);
  const voice = ZARIAH_VOICES.find((v) => v.id === voiceId) ?? ZARIAH_VOICES[0];
  return <p className="mt-1 text-xs text-slate-500">Voice: {voice.credit}</p>;
};

const HoverCard: React.FC<{ element: ChemicalElement }> = ({ element }) => (
  <div className="pointer-events-none absolute top-20 left-4 w-64 rounded-2xl border-2 border-white/15 bg-slate-900/85 backdrop-blur p-3.5">
    <div className="flex items-start gap-3">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-black text-slate-900"
        style={{ background: CATEGORY_COLORS[element.category] }}
      >
        {element.symbol}
      </div>
      <div>
        <div className="text-lg font-extrabold">{element.name}</div>
        <div className="text-sm text-slate-300">Atom number {element.number}</div>
        <div className="text-sm font-bold mt-1" style={{ color: CATEGORY_COLORS[element.category] }}>
          {CATEGORY_LABELS[element.category]}
        </div>
      </div>
    </div>
  </div>
);

const SageBox: React.FC<{ onAnswer: (yes: boolean) => void }> = ({ onAnswer }) => {
  const line = useSageStore((s) => s.current);
  const prompt = useSageStore((s) => s.prompt);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    setShown(0);
    if (!line) return;
    const interval = setInterval(() => {
      setShown((n) => {
        if (n >= line.text.length) clearInterval(interval);
        return Math.min(line.text.length, n + 2);
      });
    }, 30);
    return () => clearInterval(interval);
  }, [line]);

  if (!line && !prompt) return null;
  const warning = line?.tag === 'Warning';
  return (
    <div
      className={`absolute bottom-4 right-4 w-[min(30rem,calc(100%-17rem))] rounded-2xl border-2 bg-[#1a0f02]/90 px-5 py-4 backdrop-blur ${
        warning
          ? 'border-red-400/70 shadow-[0_0_30px_rgba(248,113,113,0.35)]'
          : 'border-amber-300/60 shadow-[0_0_35px_rgba(251,191,36,0.35)]'
      }`}
    >
      <div className="mb-2 flex items-center gap-2 border-b border-amber-300/25 pb-2 font-[Cinzel,serif] text-xs font-bold uppercase tracking-[0.3em] text-amber-300">
        <span className={`h-2.5 w-2.5 rounded-full ${warning ? 'bg-red-400' : 'bg-amber-300'} sage-pulse shadow-[0_0_10px_currentColor]`} />
        Zariah <span className="font-[Nunito,sans-serif] tracking-normal opacity-80">ザライア</span>
      </div>
      {line && (
        <div className={`text-lg font-semibold leading-snug ${warning ? 'text-red-100' : 'text-amber-50'}`}>
          <span className={`mr-1.5 font-extrabold ${warning ? 'text-red-300' : 'text-amber-300'}`}>
            《{TAG_KANJI[line.tag]}》<span className="text-sm opacity-70">{line.tag}</span>
          </span>
          {line.text.slice(0, shown)}
          {shown < line.text.length && <span className="animate-pulse">▍</span>}
        </div>
      )}
      {prompt && (
        <div className={line ? 'mt-3 border-t border-amber-300/25 pt-3' : ''}>
          <div className="text-lg font-semibold text-amber-50">
            <span className="mr-1.5 font-extrabold text-amber-300">
              《{TAG_KANJI.Answer}》<span className="text-sm opacity-70">Answer</span>
            </span>
            You can make {prompt.name}! Mix it now?
          </div>
          <div className="mt-3 flex gap-3">
            <button
              onClick={() => onAnswer(true)}
              className="flex-1 rounded-xl bg-amber-300 py-2.5 text-lg font-black text-slate-950 shadow-lg transition hover:scale-[1.04] hover:bg-amber-200"
            >
              Yes, mix it!
            </button>
            <button
              onClick={() => onAnswer(false)}
              className="flex-1 rounded-xl border-2 border-white/25 py-2.5 text-lg font-extrabold text-slate-200 transition hover:bg-white/10"
            >
              Not yet
            </button>
          </div>
          <div className="mt-2 text-sm text-amber-100/60">Using your hands? Pinch the big REACT button for yes.</div>
        </div>
      )}
    </div>
  );
};

const CameraPreview: React.FC<{ tracker: HandTracker }> = ({ tracker }) => {
  const videoHostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<HandStatus[]>(() => tracker.slots.map(() => 'none'));

  useEffect(() => {
    const host = videoHostRef.current;
    const canvas = overlayRef.current;
    if (!host || !canvas) return;
    const video = tracker.video;
    video.className = 'absolute inset-0 w-full h-full object-cover -scale-x-100';
    host.prepend(video);
    const ctx = canvas.getContext('2d')!;
    let frame = 0;
    let last = '';

    const draw = () => {
      frame = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const next = tracker.slots.map<HandStatus>(({ cursor }) => (!cursor.visible ? 'none' : cursor.pressed ? 'pinch' : 'open'));
      if (next.join() !== last) {
        last = next.join();
        setStatus(next);
      }

      tracker.slots.forEach((slot, slotIndex) => {
        const landmarks = slot.landmarks;
        if (!landmarks) return;
        const color = HAND_COLORS[slotIndex];
        const point = (i: number) => [(1 - landmarks[i].x) * canvas.width, landmarks[i].y * canvas.height] as const;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        for (const [a, b] of HAND_CONNECTIONS) {
          const [ax, ay] = point(a);
          const [bx, by] = point(b);
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
        for (let i = 0; i < landmarks.length; i++) {
          const [x, y] = point(i);
          const tip = i === 4 || i === 8;
          ctx.fillStyle = tip ? (slot.cursor.pressed ? '#fde047' : color) : '#e0f2fe';
          ctx.beginPath();
          ctx.arc(x, y, tip ? 4 : 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    };
    draw();
    return () => {
      cancelAnimationFrame(frame);
      video.remove();
    };
  }, [tracker]);

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 w-60 overflow-hidden rounded-xl border border-white/15 bg-black shadow-xl">
      <div ref={videoHostRef} className="relative aspect-[4/3]">
        <canvas ref={overlayRef} width={240} height={180} className="absolute inset-0 w-full h-full" />
      </div>
      <div className="px-3 py-1.5 text-xs bg-slate-900/90 space-y-0.5">
        {status.every((s) => s === 'none') ? (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-500" />
            Show one or both hands to the camera
          </div>
        ) : (
          status.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: s === 'none' ? '#64748b' : HAND_COLORS[i] }} />
              Hand {i + 1}: {s === 'none' ? 'not seen' : s === 'pinch' ? 'grabbing' : 'pinch to grab'}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const Toasts: React.FC = () => {
  const toasts = useLabStore((s) => s.toasts);
  const dismiss = useLabStore((s) => s.dismissToast);
  return (
    <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 w-[min(28rem,90%)]">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          onClick={() => dismiss(toast.id)}
          className={`pointer-events-auto w-full cursor-pointer rounded-xl border px-4 py-3 shadow-2xl backdrop-blur ${
            toast.kind === 'achievement'
              ? TIER_STYLES[toast.tier ?? 'bronze'] + ' bg-slate-900/90'
              : toast.kind === 'discovery'
                ? 'border-emerald-400/40 bg-emerald-950/85 text-emerald-50'
                : 'border-white/10 bg-slate-900/90 text-slate-100'
          }`}
        >
          <div className="flex items-center gap-2 font-bold">
            {toast.kind === 'achievement' ? <Trophy className="w-4 h-4" /> : toast.kind === 'discovery' ? <Sparkles className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
            {toast.kind === 'achievement' ? `Achievement unlocked: ${toast.title}` : toast.title}
          </div>
          <div className="text-sm opacity-85 mt-0.5">{toast.description}</div>
        </div>
      ))}
    </div>
  );
};

const SidePanel: React.FC = () => {
  const [tab, setTab] = useState<'discoveries' | 'achievements'>('discoveries');
  const discovered = useLabStore((s) => s.discovered);
  const achievements = useLabStore((s) => s.achievements);
  const resetProgress = useLabStore((s) => s.resetProgress);

  return (
    <aside className="w-[360px] shrink-0 flex flex-col border-l border-white/10 bg-slate-950/80">
      <PreviewCard />
      <ReactorTray />

      <div className="flex border-y border-white/10">
        {(['discoveries', 'achievements'] as const).map((id) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 py-3 font-extrabold ${tab === id ? 'text-amber-200 border-b-4 border-amber-300 bg-amber-300/5' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {id === 'discoveries'
              ? `My Discoveries ${Object.keys(discovered).length}/${COMPOUNDS.length}`
              : `My Badges ${Object.keys(achievements).length}/${ACHIEVEMENTS.length}`}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5">
        {tab === 'discoveries' ? <DiscoveryList /> : <AchievementList />}
      </div>

      <button
        onClick={() => {
          if (confirm('Start over? This erases all your discoveries and badges.')) resetProgress();
        }}
        className="flex items-center justify-center gap-1.5 py-2.5 text-sm text-slate-500 hover:text-red-300 border-t border-white/10"
      >
        <RotateCcw className="w-4 h-4" /> Start over
      </button>
    </aside>
  );
};

const PreviewCard: React.FC = () => {
  const reactor = useLabStore((s) => s.reactor);
  const discovered = useLabStore((s) => s.discovered);
  const result = useMemo(() => matchRecipe(reactor), [reactor]);

  let accent = 'border-white/10';
  let title = 'The pot is empty';
  let subtitle = 'Grab some atoms and drop them in the pot to see what you can make.';
  let formula = '';
  if (result.kind === 'exact') {
    accent = 'border-emerald-400/50 bg-emerald-500/5';
    title = result.compound.name;
    formula = prettyFormula(result.compound.formula);
    subtitle = discovered[result.compound.id] ? result.compound.fact : 'Something new! Press Mix to add it to your collection.';
  } else if (result.kind === 'partial') {
    accent = 'border-amber-400/50 bg-amber-500/5';
    title = `Almost: ${result.compound.name}`;
    formula = prettyFormula(result.compound.formula);
    subtitle = `Add ${describeMissing(result.missing)} to finish it.`;
  } else if (result.kind === 'none') {
    accent = 'border-red-400/40 bg-red-500/5';
    title = 'Hmm, nothing yet';
    subtitle = 'These atoms do not make anything we know. Try taking one out.';
  }

  return (
    <div className={`m-3 rounded-2xl border-2 p-4 ${accent}`}>
      <div className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-1">What you will make</div>
      <div className="flex items-baseline gap-2">
        <div className="text-xl font-black leading-tight">{title}</div>
        {formula && <div className="font-mono text-lg text-amber-200">{formula}</div>}
      </div>
      <div className="text-base text-slate-200 mt-1.5">{subtitle}</div>
    </div>
  );
};

const ReactorTray: React.FC = () => {
  const reactor = useLabStore((s) => s.reactor);
  const addAtom = useLabStore((s) => s.addAtom);
  const removeAtom = useLabStore((s) => s.removeAtom);
  const clearReactor = useLabStore((s) => s.clearReactor);
  const react = useLabStore((s) => s.react);
  const count = reactorAtomCount(reactor);
  const entries = Object.entries(reactor);

  return (
    <div className="mx-3 mb-3">
      <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-1.5">
        <span>Mixing pot</span>
        <span>{count}/{MAX_REACTOR_ATOMS} atoms</span>
      </div>
      <div className="flex flex-wrap gap-1.5 min-h-10">
        {entries.length === 0 && <span className="text-slate-500">No atoms yet</span>}
        {entries.map(([symbol, n]) => {
          const element = ELEMENTS_BY_SYMBOL[symbol];
          return (
            <div key={symbol} className="flex items-center rounded-lg border border-white/10 bg-slate-900 text-sm overflow-hidden">
              <button onClick={() => removeAtom(symbol)} className="px-1.5 py-1 text-slate-400 hover:bg-white/5 hover:text-white">
                <Minus className="w-3 h-3" />
              </button>
              <span className="px-1 font-bold" style={{ color: CATEGORY_COLORS[element.category as ElementCategory] }}>
                {symbol}
                <sub className="text-slate-300">{n}</sub>
              </span>
              <button onClick={() => addAtom(symbol)} className="px-1.5 py-1 text-slate-400 hover:bg-white/5 hover:text-white">
                <Plus className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 mt-2.5">
        <button
          onClick={react}
          disabled={count === 0}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-400 py-3 text-lg font-black text-slate-950 transition hover:scale-[1.03] hover:bg-emerald-300 disabled:opacity-40 disabled:hover:scale-100"
        >
          <Zap className="w-5 h-5" /> Mix!
        </button>
        <button
          onClick={clearReactor}
          disabled={count === 0}
          className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-white/15 px-4 py-3 font-bold hover:bg-white/5 disabled:opacity-40"
        >
          <Trash2 className="w-5 h-5" /> Empty
        </button>
      </div>
    </div>
  );
};

const DiscoveryList: React.FC = () => {
  const discovered = useLabStore((s) => s.discovered);
  const sorted = useMemo(
    () =>
      [...COMPOUNDS].sort((a, b) => {
        const da = discovered[a.id] ?? 0;
        const db = discovered[b.id] ?? 0;
        if (!!da !== !!db) return da ? -1 : 1;
        return da && db ? db - da : a.atomCount - b.atomCount;
      }),
    [discovered],
  );

  return (
    <>
      {sorted.map((compound) => {
        const found = !!discovered[compound.id];
        return (
          <div
            key={compound.id}
            className={`rounded-lg border px-3 py-2 ${found ? 'border-emerald-400/25 bg-emerald-500/5' : 'border-white/5 bg-white/[0.02]'}`}
          >
            {found ? (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-sm">{compound.name}</span>
                  <span className="font-mono text-cyan-200 text-sm">{prettyFormula(compound.formula)}</span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">{compound.fact}</div>
              </>
            ) : (
              <div className="flex items-center justify-between gap-2 text-sm text-slate-500">
                <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> ???</span>
                <span className="text-xs">
                  Uses {Object.keys(compound.composition).join(', ')} ({compound.atomCount} atoms)
                </span>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
};

const AchievementList: React.FC = () => {
  const discovered = useLabStore((s) => s.discovered);
  const stats = useLabStore((s) => s.stats);
  const unlocked = useLabStore((s) => s.achievements);
  const ctx = useMemo(() => ({ discovered: new Set(Object.keys(discovered)), stats }), [discovered, stats]);

  return (
    <>
      {ACHIEVEMENTS.map((achievement) => {
        const done = !!unlocked[achievement.id];
        const progress = achievement.progress?.(ctx);
        return (
          <div
            key={achievement.id}
            className={`rounded-lg border px-3 py-2 ${done ? TIER_STYLES[achievement.tier] : 'border-white/5 bg-white/[0.02] text-slate-400'}`}
          >
            <div className="flex items-center gap-2">
              {done ? <Trophy className="w-4 h-4 shrink-0" /> : <Lock className="w-4 h-4 shrink-0 opacity-60" />}
              <span className="font-semibold text-sm">{achievement.title}</span>
              <span className="ml-auto text-[10px] uppercase tracking-wider opacity-70">{achievement.tier}</span>
            </div>
            <div className="text-xs opacity-80 mt-0.5">{achievement.description}</div>
            {!done && progress && progress.target > 1 && (
              <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-cyan-400" style={{ width: `${(progress.current / progress.target) * 100}%` }} />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
};

export default ElementLabApp;
