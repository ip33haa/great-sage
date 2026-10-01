import React, { useEffect } from 'react';
import { useSageStore } from './voice/SageAnnouncer';

const DURATION_MS = 4800;
const RUNES = 'ANALYSIS · SYNTHESIS · ELEMENTUM · ZARIAH · ATOMUS · REACTIO · SAPIENTIA · ';

/** Golden "skill evolved" moment: rays, rotating rune rings, diamond frame and a subtitle. Clicking skips it. */
export const SkillCinematic: React.FC = () => {
  const cinematic = useSageStore((s) => s.cinematic);

  useEffect(() => {
    if (!cinematic) return;
    const timer = setTimeout(() => {
      if (useSageStore.getState().cinematic?.id === cinematic.id) useSageStore.setState({ cinematic: null });
    }, DURATION_MS);
    return () => clearTimeout(timer);
  }, [cinematic]);

  if (!cinematic) return null;
  return (
    <div
      key={cinematic.id}
      onClick={() => useSageStore.setState({ cinematic: null })}
      className="sage-cinematic absolute inset-0 z-30 flex cursor-pointer items-center justify-center overflow-hidden"
      style={{
        ['--sage-duration' as string]: `${DURATION_MS}ms`,
        background: 'radial-gradient(circle, rgba(255,190,60,0.55) 0%, rgba(150,60,10,0.75) 45%, rgba(25,8,0,0.92) 100%)',
      }}
    >
      <div className="sage-rays sage-spin absolute h-[180vmax] w-[180vmax]" />

      <svg viewBox="-300 -300 600 600" className="sage-burst relative h-[90vmin] w-[90vmin] drop-shadow-[0_0_25px_rgba(255,210,100,0.9)]">
        <defs>
          <path id="sage-ring-outer" d="M 0,-250 a 250,250 0 1,1 0,500 a 250,250 0 1,1 0,-500" />
          <path id="sage-ring-inner" d="M 0,-185 a 185,185 0 1,1 0,370 a 185,185 0 1,1 0,-370" />
          <radialGradient id="sage-core">
            <stop offset="0%" stopColor="#fffbe6" />
            <stop offset="45%" stopColor="#ffe08a" />
            <stop offset="100%" stopColor="#ff9d1c" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g className="sage-spin" style={{ transformOrigin: 'center' }}>
          <circle r="268" fill="none" stroke="#ffd36b" strokeWidth="2" opacity="0.7" />
          <circle r="232" fill="none" stroke="#ffd36b" strokeWidth="1.5" opacity="0.5" />
          <text fill="#ffe6a3" fontSize="20" fontFamily="Cinzel, serif" letterSpacing="5" opacity="0.85">
            <textPath href="#sage-ring-outer">{RUNES.repeat(2)}</textPath>
          </text>
        </g>

        <g className="sage-spin-reverse" style={{ transformOrigin: 'center' }}>
          <circle r="200" fill="none" stroke="#ffcf5a" strokeWidth="2" opacity="0.6" strokeDasharray="6 10" />
          <text fill="#fff0c2" fontSize="15" fontFamily="Cinzel, serif" letterSpacing="4" opacity="0.75">
            <textPath href="#sage-ring-inner">{RUNES.repeat(2)}</textPath>
          </text>
        </g>

        <g className="sage-spin" style={{ transformOrigin: 'center', animationDuration: '60s' }}>
          <rect x="-150" y="-150" width="300" height="300" transform="rotate(45)" fill="rgba(255,190,60,0.12)" stroke="#ffd36b" strokeWidth="4" />
          <rect x="-128" y="-128" width="256" height="256" transform="rotate(45)" fill="none" stroke="#fff1c4" strokeWidth="1.5" opacity="0.7" />
          {[0, 90, 180, 270].map((angle) => (
            <polygon key={angle} points="0,-238 14,-212 -14,-212" transform={`rotate(${angle})`} fill="#ffe08a" />
          ))}
        </g>

        <g className="sage-pulse" style={{ transformOrigin: 'center' }}>
          <circle r="95" fill="url(#sage-core)" />
          <circle r="62" fill="none" stroke="#fffbe6" strokeWidth="7" />
          <circle r="36" fill="#fffdf2" />
        </g>
      </svg>

      <div className="sage-subtitle absolute top-[9%] w-full px-6 text-center italic text-white">
        <div className="mb-1 text-[clamp(1.2rem,2.6vw,2rem)] font-black not-italic tracking-[0.4em] text-amber-200">《告》</div>
        <div className="mx-auto max-w-3xl text-[clamp(1.4rem,3.4vw,2.6rem)] font-extrabold leading-tight">{cinematic.title}</div>
        <div className="mx-auto mt-2 max-w-2xl text-[clamp(1rem,2vw,1.4rem)] font-bold text-amber-100">{cinematic.subtitle}</div>
      </div>
      <div className="absolute bottom-5 text-sm font-bold text-amber-100/70">Click to continue</div>
    </div>
  );
};
