export type ElementCategory =
  | 'alkali-metal'
  | 'alkaline-earth'
  | 'transition-metal'
  | 'post-transition'
  | 'metalloid'
  | 'nonmetal'
  | 'halogen'
  | 'noble-gas'
  | 'lanthanide'
  | 'actinide';

export interface ChemicalElement {
  number: number;
  symbol: string;
  name: string;
  category: ElementCategory;
  /** 1-18 grid column used for layout (f-block elements get 3-17 in their own row). */
  column: number;
  /** 1-7 for the main table, 8 for lanthanides, 9 for actinides. */
  row: number;
  color: string;
}

const RAW = `H Hydrogen|He Helium|Li Lithium|Be Beryllium|B Boron|C Carbon|N Nitrogen|O Oxygen|F Fluorine|Ne Neon|Na Sodium|Mg Magnesium|Al Aluminium|Si Silicon|P Phosphorus|S Sulfur|Cl Chlorine|Ar Argon|K Potassium|Ca Calcium|Sc Scandium|Ti Titanium|V Vanadium|Cr Chromium|Mn Manganese|Fe Iron|Co Cobalt|Ni Nickel|Cu Copper|Zn Zinc|Ga Gallium|Ge Germanium|As Arsenic|Se Selenium|Br Bromine|Kr Krypton|Rb Rubidium|Sr Strontium|Y Yttrium|Zr Zirconium|Nb Niobium|Mo Molybdenum|Tc Technetium|Ru Ruthenium|Rh Rhodium|Pd Palladium|Ag Silver|Cd Cadmium|In Indium|Sn Tin|Sb Antimony|Te Tellurium|I Iodine|Xe Xenon|Cs Caesium|Ba Barium|La Lanthanum|Ce Cerium|Pr Praseodymium|Nd Neodymium|Pm Promethium|Sm Samarium|Eu Europium|Gd Gadolinium|Tb Terbium|Dy Dysprosium|Ho Holmium|Er Erbium|Tm Thulium|Yb Ytterbium|Lu Lutetium|Hf Hafnium|Ta Tantalum|W Tungsten|Re Rhenium|Os Osmium|Ir Iridium|Pt Platinum|Au Gold|Hg Mercury|Tl Thallium|Pb Lead|Bi Bismuth|Po Polonium|At Astatine|Rn Radon|Fr Francium|Ra Radium|Ac Actinium|Th Thorium|Pa Protactinium|U Uranium|Np Neptunium|Pu Plutonium|Am Americium|Cm Curium|Bk Berkelium|Cf Californium|Es Einsteinium|Fm Fermium|Md Mendelevium|No Nobelium|Lr Lawrencium|Rf Rutherfordium|Db Dubnium|Sg Seaborgium|Bh Bohrium|Hs Hassium|Mt Meitnerium|Ds Darmstadtium|Rg Roentgenium|Cn Copernicium|Nh Nihonium|Fl Flerovium|Mc Moscovium|Lv Livermorium|Ts Tennessine|Og Oganesson`;

const CATEGORY_SETS: [ElementCategory, number[]][] = [
  ['alkali-metal', [3, 11, 19, 37, 55, 87]],
  ['alkaline-earth', [4, 12, 20, 38, 56, 88]],
  ['noble-gas', [2, 10, 18, 36, 54, 86, 118]],
  ['halogen', [9, 17, 35, 53, 85, 117]],
  ['nonmetal', [1, 6, 7, 8, 15, 16, 34]],
  ['metalloid', [5, 14, 32, 33, 51, 52]],
  ['post-transition', [13, 31, 49, 50, 81, 82, 83, 84, 113, 114, 115, 116]],
];

export const CATEGORY_COLORS: Record<ElementCategory, string> = {
  'alkali-metal': '#ff6b6b',
  'alkaline-earth': '#ffa94d',
  'transition-metal': '#ffd43b',
  'post-transition': '#a9e34b',
  metalloid: '#38d9a9',
  nonmetal: '#4dabf7',
  halogen: '#748ffc',
  'noble-gas': '#da77f2',
  lanthanide: '#f783ac',
  actinide: '#e599f7',
};

export const CATEGORY_LABELS: Record<ElementCategory, string> = {
  'alkali-metal': 'Alkali metal',
  'alkaline-earth': 'Alkaline earth',
  'transition-metal': 'Transition metal',
  'post-transition': 'Post-transition metal',
  metalloid: 'Metalloid',
  nonmetal: 'Nonmetal',
  halogen: 'Halogen',
  'noble-gas': 'Noble gas',
  lanthanide: 'Lanthanide',
  actinide: 'Actinide',
};

/** Conventional CPK-style colours for atoms in molecule models. */
const ATOM_COLORS: Record<string, string> = {
  H: '#f8f9fa', C: '#343a40', N: '#3b5bdb', O: '#e03131', F: '#69db7c', Cl: '#2f9e44',
  Br: '#a61e4d', I: '#7048e8', S: '#fcc419', P: '#fd7e14', Na: '#9775fa', K: '#845ef7',
  Li: '#cc5de8', Ca: '#8ce99a', Mg: '#5c940d', Al: '#ced4da', Si: '#e9c46a', Fe: '#d9480f',
  Cu: '#e8590c', Ag: '#dee2e6', Au: '#fab005', Zn: '#868e96', B: '#ffa8a8', Ti: '#adb5bd',
  Xe: '#66d9e8', He: '#99e9f2', Ne: '#99e9f2', Ar: '#99e9f2', Kr: '#99e9f2', Pb: '#495057',
};

function categoryFor(z: number): ElementCategory {
  if (z >= 57 && z <= 71) return 'lanthanide';
  if (z >= 89 && z <= 103) return 'actinide';
  for (const [category, numbers] of CATEGORY_SETS) {
    if (numbers.includes(z)) return category;
  }
  return 'transition-metal';
}

const PERIOD_STARTS = [1, 3, 11, 19, 37, 55, 87];

function gridPosition(z: number): { column: number; row: number } {
  let period = 1;
  for (let i = PERIOD_STARTS.length - 1; i >= 0; i--) {
    if (z >= PERIOD_STARTS[i]) {
      period = i + 1;
      break;
    }
  }
  const offset = z - PERIOD_STARTS[period - 1];
  if (period === 1) return { column: z === 1 ? 1 : 18, row: 1 };
  if (period <= 3) return { column: offset < 2 ? offset + 1 : offset + 11, row: period };
  if (period <= 5) return { column: offset + 1, row: period };
  if (offset < 2) return { column: offset + 1, row: period };
  if (offset <= 16) return { column: offset + 1, row: period === 6 ? 8 : 9 };
  return { column: offset - 13, row: period };
}

export const ELEMENTS: ChemicalElement[] = RAW.split('|').map((entry, index) => {
  const [symbol, name] = entry.split(' ');
  const number = index + 1;
  const category = categoryFor(number);
  return {
    number,
    symbol,
    name,
    category,
    ...gridPosition(number),
    color: ATOM_COLORS[symbol] ?? CATEGORY_COLORS[category],
  };
});

export const ELEMENTS_BY_SYMBOL: Record<string, ChemicalElement> = Object.fromEntries(
  ELEMENTS.map((element) => [element.symbol, element]),
);

export function isNobleGas(symbol: string): boolean {
  return ELEMENTS_BY_SYMBOL[symbol]?.category === 'noble-gas';
}
