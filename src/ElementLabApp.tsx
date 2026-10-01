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
import { SageAnnouncer, useSageStore } from './voice/SageAnnouncer';

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
    <div className="w-screen h-screen flex bg-[#0b1020] text-slate-100 overflow-hidden select-none font-[Inter,system-ui,sans-serif]">
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
            title={voiceEnabled ? 'Mute the Great Sage voice' : 'Unmute the Great Sage voice'}
          >
            {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            Great Sage
          </button>
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
      </div>

      <SidePanel />
    </div>
  );
};

const StartOverlay: React.FC<{ onCamera: () => void; onMouse: () => void }> = ({ onCamera, onMouse }) => (
  <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0b1020]/80 backdrop-blur-sm">
    <div className="max-w-lg rounded-2xl border border-white/10 bg-slate-900/90 p-8 shadow-2xl">
      <div className="flex items-center gap-3 mb-4">
        <FlaskConical className="w-8 h-8 text-cyan-300" />
        <h1 className="text-3xl font-black tracking-tight">Element Lab</h1>
      </div>
      <p className="text-slate-300 mb-5">
        Pick up elements from the periodic table, drop them into the reactor and discover real compounds.
      </p>
      <ol className="space-y-2 text-sm text-slate-300 mb-6">
        <li><span className="font-semibold text-white">Pinch</span> (thumb and index finger) on a tile to pick up an atom. Use both hands to carry two at once.</li>
        <li><span className="font-semibold text-white">Release</span> over the glowing reactor to add it.</li>
        <li>Watch the <span className="font-semibold text-white">preview</span> above the table, then pinch <span className="font-semibold text-emerald-300">REACT</span>.</li>
      </ol>
      <div className="flex gap-3">
        <button
          onClick={onCamera}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 font-bold text-slate-950 hover:bg-cyan-400"
        >
          <Hand className="w-5 h-5" /> Play with my hand
        </button>
        <button
          onClick={onMouse}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 font-semibold hover:bg-white/5"
        >
          <MousePointer2 className="w-5 h-5" /> Use mouse
        </button>
      </div>
      <p className="mt-4 text-xs text-slate-500">
        The camera feed stays on your device. Hand tracking needs localhost or HTTPS.
      </p>
    </div>
  </div>
);

const HoverCard: React.FC<{ element: ChemicalElement }> = ({ element }) => (
  <div className="pointer-events-none absolute top-20 left-4 w-56 rounded-xl border border-white/10 bg-slate-900/80 backdrop-blur p-3">
    <div className="flex items-start gap-3">
      <div
        className="w-14 h-14 rounded-lg flex items-center justify-center text-2xl font-black text-slate-900"
        style={{ background: CATEGORY_COLORS[element.category] }}
      >
        {element.symbol}
      </div>
      <div>
        <div className="font-bold">{element.name}</div>
        <div className="text-xs text-slate-400">Atomic number {element.number}</div>
        <div className="text-xs mt-1" style={{ color: CATEGORY_COLORS[element.category] }}>
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
      className={`absolute bottom-4 right-4 w-[min(26rem,calc(100%-17rem))] rounded-md border bg-[#040b1f]/85 px-4 py-3 backdrop-blur ${
        warning
          ? 'border-red-400/60 shadow-[0_0_30px_rgba(248,113,113,0.3)]'
          : 'border-sky-300/40 shadow-[0_0_30px_rgba(56,189,248,0.25)]'
      }`}
    >
      <div className="mb-2 flex items-center gap-2 border-b border-sky-300/20 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.35em] text-sky-300/70">
        <span className={`h-1.5 w-1.5 rounded-full ${warning ? 'bg-red-400' : 'bg-sky-300'} animate-pulse`} />
        Great Sage
      </div>
      {line && (
        <div className={`text-sm leading-relaxed ${warning ? 'text-red-100' : 'text-sky-50'}`}>
          <span className={`mr-1.5 font-bold ${warning ? 'text-red-300' : 'text-sky-300'}`}>《{line.tag}》</span>
          {line.text.slice(0, shown)}
          {shown < line.text.length && <span className="animate-pulse">▍</span>}
        </div>
      )}
      {prompt && (
        <div className={line ? 'mt-3 border-t border-sky-300/20 pt-2.5' : ''}>
          <div className="text-sm text-sky-50">
            <span className="mr-1.5 font-bold text-sky-300">《Answer》</span>
            Execute synthesis of {prompt.name}?
          </div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => onAnswer(true)}
              className="flex-1 rounded border border-sky-300/60 bg-sky-400/15 py-1.5 text-sm font-bold tracking-[0.3em] text-sky-100 hover:bg-sky-400/30"
            >
              YES
            </button>
            <button
              onClick={() => onAnswer(false)}
              className="flex-1 rounded border border-white/20 py-1.5 text-sm font-bold tracking-[0.3em] text-slate-300 hover:bg-white/10"
            >
              NO
            </button>
          </div>
          <div className="mt-1.5 text-[11px] text-sky-200/50">Hand users: pinch the 3D REACT button for YES.</div>
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

      <div className="flex border-y border-white/10 text-sm">
        {(['discoveries', 'achievements'] as const).map((id) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 py-2.5 font-semibold capitalize ${tab === id ? 'text-white border-b-2 border-cyan-400' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {id === 'discoveries'
              ? `Discoveries ${Object.keys(discovered).length}/${COMPOUNDS.length}`
              : `Achievements ${Object.keys(achievements).length}/${ACHIEVEMENTS.length}`}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5">
        {tab === 'discoveries' ? <DiscoveryList /> : <AchievementList />}
      </div>

      <button
        onClick={() => {
          if (confirm('Reset all discoveries and achievements?')) resetProgress();
        }}
        className="flex items-center justify-center gap-1.5 py-2 text-xs text-slate-500 hover:text-red-300 border-t border-white/10"
      >
        <RotateCcw className="w-3.5 h-3.5" /> Reset progress
      </button>
    </aside>
  );
};

const PreviewCard: React.FC = () => {
  const reactor = useLabStore((s) => s.reactor);
  const discovered = useLabStore((s) => s.discovered);
  const result = useMemo(() => matchRecipe(reactor), [reactor]);

  let accent = 'border-white/10';
  let title = 'Empty reactor';
  let subtitle = 'Pick up elements and drop them in the reactor to see what they make.';
  let formula = '';
  if (result.kind === 'exact') {
    accent = 'border-emerald-400/50 bg-emerald-500/5';
    title = result.compound.name;
    formula = prettyFormula(result.compound.formula);
    subtitle = discovered[result.compound.id] ? result.compound.fact : 'New compound! React to add it to your collection.';
  } else if (result.kind === 'partial') {
    accent = 'border-amber-400/50 bg-amber-500/5';
    title = `On the way to ${result.compound.name}`;
    formula = prettyFormula(result.compound.formula);
    subtitle = `Needs ${describeMissing(result.missing)}.`;
  } else if (result.kind === 'none') {
    accent = 'border-red-400/40 bg-red-500/5';
    title = 'No known compound';
    subtitle = 'This mix does not form anything in the lab catalogue. Try removing an atom.';
  }

  return (
    <div className={`m-3 rounded-xl border p-4 ${accent}`}>
      <div className="text-[11px] uppercase tracking-widest text-slate-400 mb-1">Output preview</div>
      <div className="flex items-baseline gap-2">
        <div className="text-lg font-black leading-tight">{title}</div>
        {formula && <div className="font-mono text-cyan-200">{formula}</div>}
      </div>
      <div className="text-sm text-slate-300 mt-1.5">{subtitle}</div>
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
      <div className="flex items-center justify-between text-[11px] uppercase tracking-widest text-slate-400 mb-1.5">
        <span>Reactor</span>
        <span>{count}/{MAX_REACTOR_ATOMS} atoms</span>
      </div>
      <div className="flex flex-wrap gap-1.5 min-h-9">
        {entries.length === 0 && <span className="text-sm text-slate-500">Nothing yet</span>}
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
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-400 py-2 font-bold text-slate-950 hover:bg-emerald-300 disabled:opacity-40"
        >
          <Zap className="w-4 h-4" /> React
        </button>
        <button
          onClick={clearReactor}
          disabled={count === 0}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/5 disabled:opacity-40"
        >
          <Trash2 className="w-4 h-4" /> Clear
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
