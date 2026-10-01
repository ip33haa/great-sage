import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { ACHIEVEMENTS, type AchievementTier, type LabStats } from '../data/achievements';
import { MAX_REACTOR_ATOMS } from '../data/compounds';
import { isNobleGas } from '../data/elements';
import { matchRecipe } from '../logic/recipeMatcher';
import { DEFAULT_VOICE_ID } from '../voice/voices';

export interface Toast {
  id: number;
  kind: 'achievement' | 'discovery' | 'info';
  title: string;
  description: string;
  tier?: AchievementTier;
}

export interface ReactionEvent {
  nonce: number;
  kind: 'success' | 'fail';
  compoundId?: string;
  isNew?: boolean;
}

export type InputMode = 'hand' | 'pointer';

interface LabState {
  reactor: Record<string, number>;
  discovered: Record<string, number>;
  achievements: Record<string, number>;
  stats: LabStats;

  toasts: Toast[];
  lastReaction: ReactionEvent | null;
  inputMode: InputMode;
  voiceEnabled: boolean;
  voiceId: number;

  setVoiceEnabled: (enabled: boolean) => void;
  setVoiceId: (id: number) => void;
  addAtom: (symbol: string) => boolean;
  removeAtom: (symbol: string) => void;
  clearReactor: () => void;
  react: () => void;
  pushToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
  setInputMode: (mode: InputMode) => void;
  resetProgress: () => void;
}

const EMPTY_STATS: LabStats = { reactions: 0, failedReactions: 0, nobleAttempts: 0, triedElements: [] };

let toastId = 0;
let reactionNonce = 0;

export const reactorAtomCount = (reactor: Record<string, number>) =>
  Object.values(reactor).reduce((sum, n) => sum + n, 0);

export const useLabStore = create<LabState>()(
  persist(
    (set, get) => {
      const evaluateAchievements = () => {
        const { discovered, stats, achievements } = get();
        const ctx = { discovered: new Set(Object.keys(discovered)), stats };
        const unlocked = ACHIEVEMENTS.filter((a) => !achievements[a.id] && a.check(ctx));
        if (unlocked.length === 0) return;
        const now = Date.now();
        set({
          achievements: { ...achievements, ...Object.fromEntries(unlocked.map((a) => [a.id, now])) },
        });
        for (const achievement of unlocked) {
          get().pushToast({
            kind: 'achievement',
            title: achievement.title,
            description: achievement.description,
            tier: achievement.tier,
          });
        }
      };

      return {
        reactor: {},
        discovered: {},
        achievements: {},
        stats: EMPTY_STATS,
        toasts: [],
        lastReaction: null,
        inputMode: 'pointer',
        voiceEnabled: true,
        voiceId: DEFAULT_VOICE_ID,

        setVoiceEnabled: (voiceEnabled) => set({ voiceEnabled }),
        setVoiceId: (voiceId) => set({ voiceId }),

        addAtom: (symbol) => {
          const { reactor, stats } = get();
          if (reactorAtomCount(reactor) >= MAX_REACTOR_ATOMS) {
            get().pushToast({ kind: 'info', title: 'Reactor full', description: `Max ${MAX_REACTOR_ATOMS} atoms. React or clear it.` });
            return false;
          }
          const triedElements = stats.triedElements.includes(symbol)
            ? stats.triedElements
            : [...stats.triedElements, symbol];
          set({
            reactor: { ...reactor, [symbol]: (reactor[symbol] ?? 0) + 1 },
            stats: { ...stats, triedElements },
          });
          evaluateAchievements();
          return true;
        },

        removeAtom: (symbol) => {
          const reactor = { ...get().reactor };
          if (!reactor[symbol]) return;
          reactor[symbol] -= 1;
          if (reactor[symbol] <= 0) delete reactor[symbol];
          set({ reactor });
        },

        clearReactor: () => set({ reactor: {} }),

        react: () => {
          const { reactor, stats, discovered } = get();
          const result = matchRecipe(reactor);
          if (result.kind === 'empty') return;

          if (result.kind === 'exact') {
            const id = result.compound.id;
            const isNew = !discovered[id];
            set({
              reactor: {},
              discovered: isNew ? { ...discovered, [id]: Date.now() } : discovered,
              stats: { ...stats, reactions: stats.reactions + 1 },
              lastReaction: { nonce: ++reactionNonce, kind: 'success', compoundId: id, isNew },
            });
            get().pushToast({
              kind: 'discovery',
              title: isNew ? `New discovery: ${result.compound.name}` : result.compound.name,
              description: isNew ? result.compound.fact : 'Already in your collection.',
            });
          } else {
            const hasNoble = Object.keys(reactor).some(isNobleGas);
            set({
              stats: {
                ...stats,
                reactions: stats.reactions + 1,
                failedReactions: stats.failedReactions + 1,
                nobleAttempts: stats.nobleAttempts + (hasNoble ? 1 : 0),
              },
              lastReaction: { nonce: ++reactionNonce, kind: 'fail' },
            });
          }
          evaluateAchievements();
        },

        pushToast: (toast) => {
          const id = ++toastId;
          set({ toasts: [...get().toasts, { ...toast, id }].slice(-4) });
          setTimeout(() => get().dismissToast(id), toast.kind === 'achievement' ? 6000 : 4000);
        },

        dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

        setInputMode: (inputMode) => set({ inputMode }),

        resetProgress: () =>
          set({ reactor: {}, discovered: {}, achievements: {}, stats: EMPTY_STATS, lastReaction: null }),
      };
    },
    {
      name: 'element-lab-progress',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        discovered: state.discovered,
        achievements: state.achievements,
        stats: state.stats,
        voiceEnabled: state.voiceEnabled,
        voiceId: state.voiceId,
      }),
    },
  ),
);
