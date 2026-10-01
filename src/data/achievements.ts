import { COMPOUNDS, COMPOUNDS_BY_ID, type CompoundTag } from './compounds';

export interface LabStats {
  reactions: number;
  failedReactions: number;
  nobleAttempts: number;
  triedElements: string[];
}

export interface AchievementContext {
  discovered: Set<string>;
  stats: LabStats;
}

export type AchievementTier = 'bronze' | 'silver' | 'gold';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  tier: AchievementTier;
  check: (ctx: AchievementContext) => boolean;
  /** Optional progress for count-based achievements. */
  progress?: (ctx: AchievementContext) => { current: number; target: number };
}

const hasAll = (ctx: AchievementContext, ids: string[]) => ids.every((id) => ctx.discovered.has(id));

const countTag = (ctx: AchievementContext, tag: CompoundTag) =>
  [...ctx.discovered].filter((id) => COMPOUNDS_BY_ID[id]?.tags.includes(tag)).length;

function collection(
  id: string,
  title: string,
  description: string,
  tier: AchievementTier,
  ids: string[],
): Achievement {
  return {
    id,
    title,
    description,
    tier,
    check: (ctx) => hasAll(ctx, ids),
    progress: (ctx) => ({ current: ids.filter((c) => ctx.discovered.has(c)).length, target: ids.length }),
  };
}

function tagCount(
  id: string,
  title: string,
  description: string,
  tier: AchievementTier,
  tag: CompoundTag,
  target: number,
): Achievement {
  return {
    id,
    title,
    description,
    tier,
    check: (ctx) => countTag(ctx, tag) >= target,
    progress: (ctx) => ({ current: Math.min(countTag(ctx, tag), target), target }),
  };
}

function discoveryCount(id: string, title: string, tier: AchievementTier, target: number): Achievement {
  return {
    id,
    title,
    description: target === 1 ? 'Discover your first compound.' : `Discover ${target} compounds.`,
    tier,
    check: (ctx) => ctx.discovered.size >= target,
    progress: (ctx) => ({ current: Math.min(ctx.discovered.size, target), target }),
  };
}

export const ACHIEVEMENTS: Achievement[] = [
  discoveryCount('first-reaction', 'First Reaction', 'bronze', 1),
  collection('hydro-homie', 'Hydro Homie', 'Make water (H2O).', 'bronze', ['H2O']),
  collection('salt-of-the-earth', 'Salt of the Earth', 'Make table salt (NaCl).', 'bronze', ['NaCl']),
  collection('greenhouse', 'Greenhouse', 'Make carbon dioxide and methane.', 'silver', ['CO2', 'CH4']),
  {
    id: 'noble-attempt',
    title: 'Noble Attempt',
    description: 'Try to react a noble gas. They rarely cooperate.',
    tier: 'bronze',
    check: (ctx) => ctx.stats.nobleAttempts >= 1,
  },
  collection('rule-breaker', 'Rule Breaker', 'Make a real noble gas compound (xenon fluorides).', 'gold', ['XeF2', 'XeF4']),
  tagCount('organic-chemist', 'Organic Chemist', 'Discover 5 organic compounds.', 'silver', 'organic', 5),
  tagCount('acid-test', 'Acid Test', 'Discover 3 acids.', 'bronze', 'acid', 3),
  tagCount('base-jumper', 'Base Jumper', 'Discover 2 bases.', 'bronze', 'base', 2),
  tagCount('rock-collector', 'Rock Collector', 'Discover 4 minerals.', 'silver', 'mineral', 4),
  collection('rust-never-sleeps', 'Rust Never Sleeps', 'Make iron(III) oxide.', 'bronze', ['Fe2O3']),
  collection('fools-gold', "Fool's Gold", 'Make pyrite.', 'silver', ['FeS2']),
  collection('sweet-science', 'Sweet Science', 'Make glucose.', 'silver', ['C6H12O6']),
  collection('wake-up-call', 'Wake-up Call', 'Make caffeine.', 'gold', ['C8H10N4O2']),
  collection('headache-cure', 'Headache Cure', 'Make aspirin.', 'gold', ['C9H8O4']),
  collection('diatomic-club', 'Diatomic Club', 'Make all seven diatomic elements.', 'gold', ['H2', 'N2', 'O2', 'F2', 'Cl2', 'Br2', 'I2']),
  collection('kitchen-chemist', 'Kitchen Chemist', 'Make salt, baking soda, vinegar and sugar.', 'silver', ['NaCl', 'NaHCO3', 'C2H4O2', 'C6H12O6']),
  {
    id: 'big-molecule',
    title: 'Go Big',
    description: 'Discover a compound with 20 or more atoms.',
    tier: 'silver',
    check: (ctx) => [...ctx.discovered].some((id) => (COMPOUNDS_BY_ID[id]?.atomCount ?? 0) >= 20),
  },
  {
    id: 'mad-scientist',
    title: 'Mad Scientist',
    description: 'Attempt 10 reactions that fail.',
    tier: 'bronze',
    check: (ctx) => ctx.stats.failedReactions >= 10,
    progress: (ctx) => ({ current: Math.min(ctx.stats.failedReactions, 10), target: 10 }),
  },
  {
    id: 'periodic-explorer',
    title: 'Periodic Explorer',
    description: 'Put 30 different elements into the reactor.',
    tier: 'silver',
    check: (ctx) => ctx.stats.triedElements.length >= 30,
    progress: (ctx) => ({ current: Math.min(ctx.stats.triedElements.length, 30), target: 30 }),
  },
  discoveryCount('collector-10', 'Collector', 'bronze', 10),
  discoveryCount('collector-25', 'Curator', 'silver', 25),
  discoveryCount('collector-50', 'Museum Director', 'gold', 50),
  {
    id: 'completionist',
    title: 'Completionist',
    description: `Discover all ${COMPOUNDS.length} compounds.`,
    tier: 'gold',
    check: (ctx) => ctx.discovered.size >= COMPOUNDS.length,
    progress: (ctx) => ({ current: ctx.discovered.size, target: COMPOUNDS.length }),
  },
];
