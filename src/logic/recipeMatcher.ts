import { COMPOUNDS, COMPOUNDS_BY_SIGNATURE, signatureOf, type Compound } from '../data/compounds';

export type MatchResult =
  | { kind: 'empty' }
  | { kind: 'exact'; compound: Compound }
  | { kind: 'partial'; compound: Compound; missing: Record<string, number> }
  | { kind: 'none' };

export function matchRecipe(reactor: Record<string, number>): MatchResult {
  const symbols = Object.keys(reactor).filter((symbol) => reactor[symbol] > 0);
  if (symbols.length === 0) return { kind: 'empty' };

  const exact = COMPOUNDS_BY_SIGNATURE.get(signatureOf(reactor));
  if (exact) return { kind: 'exact', compound: exact };

  let best: { compound: Compound; missing: Record<string, number>; missingTotal: number } | null = null;
  for (const compound of COMPOUNDS) {
    const fitsInside = symbols.every((symbol) => (compound.composition[symbol] ?? 0) >= reactor[symbol]);
    if (!fitsInside) continue;

    const missing: Record<string, number> = {};
    let missingTotal = 0;
    for (const [symbol, needed] of Object.entries(compound.composition)) {
      const short = needed - (reactor[symbol] ?? 0);
      if (short > 0) {
        missing[symbol] = short;
        missingTotal += short;
      }
    }

    if (
      !best ||
      missingTotal < best.missingTotal ||
      (missingTotal === best.missingTotal && compound.atomCount < best.compound.atomCount)
    ) {
      best = { compound, missing, missingTotal };
    }
  }

  return best ? { kind: 'partial', compound: best.compound, missing: best.missing } : { kind: 'none' };
}

export function describeMissing(missing: Record<string, number>): string {
  return Object.entries(missing)
    .map(([symbol, count]) => `${count} more ${symbol}`)
    .join(', ');
}
