export type CompoundTag =
  | 'diatomic'
  | 'organic'
  | 'acid'
  | 'base'
  | 'salt'
  | 'oxide'
  | 'gas'
  | 'noble'
  | 'kitchen'
  | 'mineral';

export type MoleculeShape = 'auto' | 'lattice';

export interface Compound {
  id: string;
  formula: string;
  name: string;
  composition: Record<string, number>;
  atomCount: number;
  tags: CompoundTag[];
  fact: string;
  shape: MoleculeShape;
}

type Row = [formula: string, name: string, tags: CompoundTag[], fact: string, shape?: MoleculeShape];

const ROWS: Row[] = [
  // Elemental molecules
  ['H2', 'Hydrogen gas', ['diatomic', 'gas'], 'The lightest gas. It makes up about 75% of the normal matter in the universe.'],
  ['N2', 'Nitrogen gas', ['diatomic', 'gas'], 'About 78% of every breath you take is nitrogen.'],
  ['O2', 'Oxygen gas', ['diatomic', 'gas'], 'Liquid oxygen is pale blue and is attracted to magnets.'],
  ['F2', 'Fluorine gas', ['diatomic', 'gas'], 'The most reactive element. It can even set glass on fire.'],
  ['Cl2', 'Chlorine gas', ['diatomic', 'gas'], 'A yellow-green gas used to keep swimming pools clean.'],
  ['Br2', 'Bromine', ['diatomic'], 'One of only two elements that are liquid at room temperature.'],
  ['I2', 'Iodine', ['diatomic'], 'Solid iodine skips the liquid phase and turns straight into violet vapour.'],
  ['O3', 'Ozone', ['gas'], 'The ozone layer absorbs most of the Sun\'s harmful UV-B radiation.'],

  // Water and friends
  ['H2O', 'Water', ['kitchen'], 'Water is one of the few substances that expands when it freezes, so ice floats.'],
  ['H2O2', 'Hydrogen peroxide', [], 'Used as a disinfectant and rocket propellant. It fizzes on cuts because of the enzyme catalase.'],

  // Carbon chemistry
  ['CO2', 'Carbon dioxide', ['gas', 'oxide'], 'Plants breathe it in; it is also what makes soda fizzy.'],
  ['CO', 'Carbon monoxide', ['gas', 'oxide'], 'A colourless, odourless and toxic gas, which is why CO detectors exist.'],
  ['CH4', 'Methane', ['organic', 'gas'], 'The main component of natural gas, and a potent greenhouse gas.'],
  ['C2H6', 'Ethane', ['organic', 'gas'], 'The second-simplest alkane, cracked to make plastics.'],
  ['C2H4', 'Ethene', ['organic', 'gas'], 'Ripe bananas release ethene, which ripens other fruit nearby.'],
  ['C2H2', 'Ethyne (acetylene)', ['organic', 'gas'], 'Burns at over 3,000 °C in welding torches.'],
  ['C3H8', 'Propane', ['organic', 'gas'], 'Barbecue fuel. It is stored as a liquid under pressure.'],
  ['C4H10', 'Butane', ['organic', 'gas'], 'The fuel inside disposable lighters.'],
  ['C6H6', 'Benzene', ['organic'], 'Its ring structure was famously said to have come to Kekulé in a dream of a snake biting its tail.'],
  ['C2H6O', 'Ethanol', ['organic'], 'The alcohol in drinks, and a renewable fuel additive.'],
  ['CH4O', 'Methanol', ['organic'], 'Wood alcohol. Highly toxic, but a useful racing fuel.'],
  ['CH2O', 'Formaldehyde', ['organic', 'gas'], 'Used to preserve biological specimens.'],
  ['C2H4O2', 'Acetic acid', ['organic', 'acid', 'kitchen'], 'Vinegar is about 5% acetic acid.'],
  ['CH2O2', 'Formic acid', ['organic', 'acid'], 'Ants and stinging nettles use it as a defence.'],
  ['C3H6O', 'Acetone', ['organic'], 'Nail polish remover. Your body also makes small amounts of it.'],
  ['C6H12O6', 'Glucose', ['organic', 'kitchen'], 'The sugar your cells burn for energy; plants make it from sunlight.'],
  ['CH4N2O', 'Urea', ['organic'], 'The first organic compound made from inorganic materials (Wöhler, 1828).'],
  ['HCN', 'Hydrogen cyanide', ['gas'], 'Smells of bitter almonds to some people, and is extremely toxic.'],
  ['H2CO3', 'Carbonic acid', ['acid'], 'Forms when CO2 dissolves in water, giving soda its tang.'],
  ['CHCl3', 'Chloroform', ['organic'], 'Once used as an anaesthetic in the 1800s.'],
  ['CCl4', 'Carbon tetrachloride', ['organic'], 'Was used in fire extinguishers until its toxicity was understood.'],
  ['C8H10N4O2', 'Caffeine', ['organic'], 'Blocks adenosine receptors in your brain, keeping you alert.'],
  ['C9H8O4', 'Aspirin', ['organic'], 'Derived from willow bark, which people chewed for pain relief for millennia.'],
  ['C2H5NO2', 'Glycine', ['organic'], 'The simplest amino acid, and it has been found in comet dust.'],

  // Nitrogen
  ['NH3', 'Ammonia', ['gas', 'base'], 'Half the world\'s food depends on ammonia fertiliser made by the Haber process.'],
  ['NO', 'Nitric oxide', ['gas', 'oxide'], 'A signalling molecule in your body that helps blood vessels relax.'],
  ['NO2', 'Nitrogen dioxide', ['gas', 'oxide'], 'The brown gas in city smog.'],
  ['N2O', 'Nitrous oxide', ['gas', 'oxide'], 'Laughing gas, used by dentists and in whipped cream cans.'],
  ['HNO3', 'Nitric acid', ['acid'], 'A strong acid used to make fertilisers and explosives.'],
  ['N2H4', 'Hydrazine', [], 'Rocket fuel used for spacecraft thrusters.'],

  // Acids, sulfur, phosphorus
  ['HCl', 'Hydrochloric acid', ['acid'], 'Your stomach makes it to digest food.'],
  ['HF', 'Hydrofluoric acid', ['acid'], 'Weak by definition, but it can dissolve glass.'],
  ['HBr', 'Hydrobromic acid', ['acid'], 'A strong acid used in the chemical industry.'],
  ['HI', 'Hydroiodic acid', ['acid'], 'The strongest of the hydrohalic acids.'],
  ['H2S', 'Hydrogen sulfide', ['gas'], 'The rotten-egg smell. Your nose detects it at under 1 part per billion.'],
  ['SO2', 'Sulfur dioxide', ['gas', 'oxide'], 'Released by volcanoes; it causes acid rain.'],
  ['SO3', 'Sulfur trioxide', ['oxide'], 'The intermediate step in making sulfuric acid.'],
  ['H2SO4', 'Sulfuric acid', ['acid'], 'The most produced industrial chemical in the world.'],
  ['H3PO4', 'Phosphoric acid', ['acid', 'kitchen'], 'Gives cola its tangy bite.'],
  ['PH3', 'Phosphine', ['gas'], 'A toxic gas that was controversially detected in Venus\'s clouds.'],
  ['SF6', 'Sulfur hexafluoride', ['gas'], 'So dense that breathing it makes your voice extremely deep.'],
  ['SiH4', 'Silane', ['gas'], 'Ignites spontaneously in air; used to make computer chips.'],

  // Salts
  ['NaCl', 'Sodium chloride (table salt)', ['salt', 'kitchen', 'mineral'], 'Sodium is a violently reactive metal and chlorine a toxic gas, yet together they season your food.', 'lattice'],
  ['KCl', 'Potassium chloride', ['salt'], 'Used as a salt substitute.', 'lattice'],
  ['KI', 'Potassium iodide', ['salt'], 'Protects the thyroid from radioactive iodine.', 'lattice'],
  ['NaF', 'Sodium fluoride', ['salt'], 'Found in toothpaste to strengthen enamel.', 'lattice'],
  ['LiF', 'Lithium fluoride', ['salt'], 'Transparent to deep ultraviolet light; used in special optics.', 'lattice'],
  ['AgCl', 'Silver chloride', ['salt'], 'Darkens in light, which made early photography possible.', 'lattice'],
  ['CaCl2', 'Calcium chloride', ['salt'], 'Spread on icy roads because it melts ice even at -50 °C.'],
  ['MgCl2', 'Magnesium chloride', ['salt'], 'Used to make tofu set.'],
  ['CaF2', 'Calcium fluoride (fluorite)', ['salt', 'mineral'], 'The mineral that gave us the word "fluorescence".'],
  ['NH4Cl', 'Ammonium chloride', ['salt'], 'Gives Scandinavian salty liquorice its kick.'],
  ['KNO3', 'Potassium nitrate', ['salt'], 'Saltpetre, the oxidiser in gunpowder.'],
  ['NaClO', 'Sodium hypochlorite', ['salt'], 'The active ingredient in household bleach.'],
  ['CuSO4', 'Copper(II) sulfate', ['salt'], 'Forms stunning blue crystals.'],
  ['CaCO3', 'Calcium carbonate', ['salt', 'mineral'], 'Chalk, marble, seashells and limestone are all made of it.'],
  ['NaHCO3', 'Sodium bicarbonate', ['salt', 'kitchen', 'base'], 'Baking soda. Mix it with vinegar for a classic volcano.'],
  ['Na2CO3', 'Sodium carbonate', ['salt', 'base'], 'Washing soda, used in glassmaking for thousands of years.'],
  ['AuCl3', 'Gold(III) chloride', ['salt'], 'One of the few ways to dissolve gold.'],
  ['LiH', 'Lithium hydride', [], 'Stores hydrogen and was used as nuclear shielding.'],

  // Bases
  ['NaOH', 'Sodium hydroxide', ['base'], 'Lye, used to make soap from fats.'],
  ['KOH', 'Potassium hydroxide', ['base'], 'Used in alkaline batteries.'],
  ['Ca(OH)2', 'Calcium hydroxide', ['base'], 'Slaked lime, used in mortar and plaster since Roman times.'],
  ['Mg(OH)2', 'Magnesium hydroxide', ['base'], 'Milk of magnesia, an antacid.'],

  // Oxides and minerals
  ['CaO', 'Calcium oxide', ['oxide'], 'Quicklime. Heated, it glows brightly, giving us "limelight".', 'lattice'],
  ['MgO', 'Magnesium oxide', ['oxide'], 'The white ash left after burning magnesium ribbon.', 'lattice'],
  ['ZnO', 'Zinc oxide', ['oxide'], 'The white stuff in mineral sunscreen.', 'lattice'],
  ['CuO', 'Copper(II) oxide', ['oxide'], 'A black powder used to colour ceramics.', 'lattice'],
  ['Al2O3', 'Aluminium oxide', ['oxide', 'mineral'], 'Rubies and sapphires are aluminium oxide with trace impurities.'],
  ['Fe2O3', 'Iron(III) oxide (rust)', ['oxide', 'mineral'], 'Rust. Mars is red because its surface is covered in it.'],
  ['Fe3O4', 'Magnetite', ['oxide', 'mineral'], 'The most magnetic naturally occurring mineral.'],
  ['SiO2', 'Silicon dioxide', ['oxide', 'mineral'], 'Quartz and sand. Melt it and you get glass.'],
  ['TiO2', 'Titanium dioxide', ['oxide'], 'The brilliant white pigment in paint and toothpaste.'],
  ['Cu2O', 'Copper(I) oxide', ['oxide'], 'A red pigment, and used in antifouling boat paint.'],
  ['Li2O', 'Lithium oxide', ['oxide'], 'Used in ceramic glazes.'],
  ['FeS2', 'Pyrite (fool\'s gold)', ['mineral'], 'Its golden shine fooled many prospectors.'],

  // Noble gas chemistry
  ['XeF2', 'Xenon difluoride', ['noble'], 'Proof that "noble" gases can react after all.'],
  ['XeF4', 'Xenon tetrafluoride', ['noble'], 'The first binary compound of a noble gas found to be stable at room temperature.'],
];

export function parseFormula(formula: string): Record<string, number> {
  let index = 0;

  const parseGroup = (): Record<string, number> => {
    const counts: Record<string, number> = {};
    const add = (symbol: string, amount: number) => {
      counts[symbol] = (counts[symbol] ?? 0) + amount;
    };
    const readNumber = () => {
      const match = /^\d+/.exec(formula.slice(index));
      if (!match) return 1;
      index += match[0].length;
      return Number(match[0]);
    };

    while (index < formula.length) {
      const char = formula[index];
      if (char === '(') {
        index++;
        const inner = parseGroup();
        const multiplier = readNumber();
        for (const [symbol, amount] of Object.entries(inner)) add(symbol, amount * multiplier);
      } else if (char === ')') {
        index++;
        return counts;
      } else {
        const match = /^[A-Z][a-z]?/.exec(formula.slice(index));
        if (!match) throw new Error(`Bad formula: ${formula}`);
        index += match[0].length;
        add(match[0], readNumber());
      }
    }
    return counts;
  };

  return parseGroup();
}

export function signatureOf(counts: Record<string, number>): string {
  return Object.keys(counts)
    .filter((symbol) => counts[symbol] > 0)
    .sort()
    .map((symbol) => `${symbol}${counts[symbol]}`)
    .join('');
}

export const COMPOUNDS: Compound[] = ROWS.map(([formula, name, tags, fact, shape]) => {
  const composition = parseFormula(formula);
  return {
    id: formula,
    formula,
    name,
    composition,
    atomCount: Object.values(composition).reduce((sum, n) => sum + n, 0),
    tags,
    fact,
    shape: shape ?? 'auto',
  };
});

export const COMPOUNDS_BY_ID: Record<string, Compound> = Object.fromEntries(
  COMPOUNDS.map((compound) => [compound.id, compound]),
);

export const COMPOUNDS_BY_SIGNATURE = new Map<string, Compound>();
for (const compound of COMPOUNDS) {
  const signature = signatureOf(compound.composition);
  if (COMPOUNDS_BY_SIGNATURE.has(signature)) {
    console.warn(`[element-lab] Duplicate compound signature ${signature} (${compound.id})`);
  }
  COMPOUNDS_BY_SIGNATURE.set(signature, compound);
}

const SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉';

export function prettyFormula(formula: string): string {
  return formula.replace(/\d/g, (digit) => SUBSCRIPTS[Number(digit)]);
}

export const MAX_REACTOR_ATOMS = Math.max(...COMPOUNDS.map((compound) => compound.atomCount));
