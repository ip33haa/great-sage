import * as THREE from 'three';
import type { Compound } from '../data/compounds';
import { ELEMENTS_BY_SYMBOL } from '../data/elements';

const VALENCE: Record<string, number> = {
  H: 1, C: 4, Si: 4, N: 3, P: 3, B: 3, O: 2, S: 6, F: 1, Cl: 1, Br: 1, I: 1,
  Xe: 4, Fe: 3, Al: 3, Au: 3, Ti: 4, Li: 1, Na: 1, K: 1, Ag: 1,
};
const VALENCE_ELECTRONS: Record<string, number> = { O: 6, S: 6, N: 5, P: 5, Xe: 8 };

const valenceOf = (symbol: string) => VALENCE[symbol] ?? 2;

export function atomRadius(symbol: string): number {
  if (symbol === 'H') return 0.28;
  const category = ELEMENTS_BY_SYMBOL[symbol]?.category;
  return category === 'nonmetal' || category === 'halogen' || category === 'noble-gas' ? 0.42 : 0.5;
}

export function atomColor(symbol: string): string {
  return ELEMENTS_BY_SYMBOL[symbol]?.color ?? '#adb5bd';
}

interface AtomNode {
  symbol: string;
  parent: number;
  children: number[];
  position: THREE.Vector3;
}

const CANDIDATE_DIRECTIONS: THREE.Vector3[] = (() => {
  const points: THREE.Vector3[] = [];
  const count = 160;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    points.push(new THREE.Vector3(Math.cos(golden * i) * r, y, Math.sin(golden * i) * r));
  }
  return points;
})();

function pickDirection(used: THREE.Vector3[]): THREE.Vector3 {
  if (used.length === 0) return new THREE.Vector3(1, 0, 0);
  let best = CANDIDATE_DIRECTIONS[0];
  let bestScore = -Infinity;
  for (const candidate of CANDIDATE_DIRECTIONS) {
    let minAngle = Infinity;
    for (const u of used) minAngle = Math.min(minAngle, candidate.angleTo(u));
    if (minAngle > bestScore) {
      bestScore = minAngle;
      best = candidate;
    }
  }
  return best.clone();
}

function bondLength(a: string, b: string) {
  return a === 'H' || b === 'H' ? 0.95 : 1.3;
}

/** Builds a bond graph from a composition using simple valence heuristics. */
function buildGraph(composition: Record<string, number>): AtomNode[] {
  const symbols = Object.entries(composition).flatMap(([symbol, n]) => Array(n).fill(symbol) as string[]);
  const nodes: AtomNode[] = [];
  const add = (symbol: string, parent: number) => {
    const index = nodes.length;
    nodes.push({ symbol, parent, children: [], position: new THREE.Vector3() });
    if (parent >= 0) nodes[parent].children.push(index);
    return index;
  };

  const remaining = [...symbols];
  const take = (symbol: string) => remaining.splice(remaining.indexOf(symbol), 1);

  const carbons = remaining.filter((s) => s === 'C');
  if (carbons.length > 0) {
    let previous = -1;
    for (const c of carbons) {
      take(c);
      previous = add(c, previous);
    }
  } else {
    const heavy = remaining.filter((s) => s !== 'H');
    const pool = heavy.length > 0 ? heavy : remaining;
    const root = [...pool].sort(
      (a, b) => valenceOf(b) - valenceOf(a) || composition[a] - composition[b],
    )[0];
    take(root);
    add(root, -1);
  }

  remaining.sort((a, b) => (a === 'H' ? 1 : 0) - (b === 'H' ? 1 : 0) || valenceOf(b) - valenceOf(a));
  for (const symbol of remaining) {
    let parent = 0;
    let bestFree = -Infinity;
    nodes.forEach((node, index) => {
      if (node.symbol === 'H' && nodes.length > 1) return;
      const bonds = node.children.length + (node.parent >= 0 ? 1 : 0);
      const free = valenceOf(node.symbol) - bonds;
      if (free > bestFree) {
        bestFree = free;
        parent = index;
      }
    });
    add(symbol, parent);
  }
  return nodes;
}

function layoutGraph(nodes: AtomNode[]) {
  const visit = (index: number, incoming: THREE.Vector3 | null) => {
    const node = nodes[index];
    const used: THREE.Vector3[] = incoming ? [incoming] : [];
    const bonds = node.children.length + (node.parent >= 0 ? 1 : 0);
    const electrons = VALENCE_ELECTRONS[node.symbol];
    const lonePairs = electrons ? Math.max(0, Math.floor((electrons - bonds) / 2)) : 0;
    for (let i = 0; i < lonePairs; i++) used.push(pickDirection(used));
    for (const child of node.children) {
      const direction = pickDirection(used);
      used.push(direction);
      nodes[child].position
        .copy(node.position)
        .addScaledVector(direction, bondLength(node.symbol, nodes[child].symbol));
      visit(child, direction.clone().negate());
    }
  };
  visit(0, null);
  relax(nodes);
}

/** A few iterations of spring/repulsion so larger molecules don't overlap themselves. */
function relax(nodes: AtomNode[]) {
  const bonded = new Set<string>();
  nodes.forEach((node, i) => {
    if (node.parent >= 0) bonded.add(`${Math.min(i, node.parent)}-${Math.max(i, node.parent)}`);
  });
  const delta = new THREE.Vector3();
  for (let iteration = 0; iteration < 80; iteration++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i].position;
        const b = nodes[j].position;
        delta.subVectors(b, a);
        const distance = Math.max(1e-3, delta.length());
        const isBond = bonded.has(`${i}-${j}`);
        const rest = isBond ? bondLength(nodes[i].symbol, nodes[j].symbol) : 1.5;
        if (!isBond && distance >= rest) continue;
        const correction = ((distance - rest) / distance) * (isBond ? 0.25 : 0.1);
        a.addScaledVector(delta, correction);
        b.addScaledVector(delta, -correction);
      }
    }
  }
}

function latticeNodes(composition: Record<string, number>): { atoms: { symbol: string; position: THREE.Vector3 }[]; bonds: [number, number][] } {
  const [a, b] = Object.keys(composition);
  const atoms: { symbol: string; position: THREE.Vector3 }[] = [];
  const bonds: [number, number][] = [];
  const size = 3;
  const index = (x: number, y: number, z: number) => x * size * size + y * size + z;
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      for (let z = 0; z < size; z++) {
        atoms.push({ symbol: (x + y + z) % 2 === 0 ? a : b, position: new THREE.Vector3(x - 1, y - 1, z - 1).multiplyScalar(1.1) });
        if (x > 0) bonds.push([index(x - 1, y, z), index(x, y, z)]);
        if (y > 0) bonds.push([index(x, y - 1, z), index(x, y, z)]);
        if (z > 0) bonds.push([index(x, y, z - 1), index(x, y, z)]);
      }
    }
  }
  return { atoms, bonds };
}

const sphereGeometry = new THREE.SphereGeometry(1, 24, 16);
const bondGeometry = new THREE.CylinderGeometry(1, 1, 1, 10);
const materialCache = new Map<string, THREE.MeshStandardMaterial>();

function atomMaterial(symbol: string, ghost: boolean) {
  const key = `${symbol}:${ghost}`;
  let material = materialCache.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color: atomColor(symbol),
      roughness: 0.35,
      metalness: 0.1,
      transparent: ghost,
      opacity: ghost ? 0.28 : 1,
      depthWrite: !ghost,
    });
    materialCache.set(key, material);
  }
  return material;
}

const bondMaterial = new THREE.MeshStandardMaterial({ color: '#ced4da', roughness: 0.5 });
const ghostBondMaterial = new THREE.MeshStandardMaterial({ color: '#ced4da', transparent: true, opacity: 0.2, depthWrite: false });

export function createAtomMesh(symbol: string, ghost = false): THREE.Mesh {
  const mesh = new THREE.Mesh(sphereGeometry, atomMaterial(symbol, ghost));
  mesh.scale.setScalar(atomRadius(symbol));
  return mesh;
}

/** Returns a centred molecule group scaled so its bounding radius equals `fitRadius`. */
export function buildMolecule(compound: Compound, options: { ghost?: boolean; fitRadius?: number } = {}): THREE.Group {
  const { ghost = false, fitRadius = 2 } = options;
  let atoms: { symbol: string; position: THREE.Vector3 }[];
  let bonds: [number, number][];

  if (compound.shape === 'lattice' && Object.keys(compound.composition).length === 2) {
    ({ atoms, bonds } = latticeNodes(compound.composition));
  } else {
    const nodes = buildGraph(compound.composition);
    layoutGraph(nodes);
    atoms = nodes;
    bonds = nodes.flatMap((node, i) => (node.parent >= 0 ? [[node.parent, i] as [number, number]] : []));
  }

  const centre = new THREE.Vector3();
  atoms.forEach((atom) => centre.add(atom.position));
  centre.divideScalar(atoms.length);
  let radius = 0.6;
  atoms.forEach((atom) => {
    atom.position.sub(centre);
    radius = Math.max(radius, atom.position.length() + atomRadius(atom.symbol));
  });

  const group = new THREE.Group();
  for (const atom of atoms) {
    const mesh = createAtomMesh(atom.symbol, ghost);
    mesh.position.copy(atom.position);
    group.add(mesh);
  }

  const up = new THREE.Vector3(0, 1, 0);
  for (const [i, j] of bonds) {
    const a = atoms[i].position;
    const b = atoms[j].position;
    const direction = new THREE.Vector3().subVectors(b, a);
    const mesh = new THREE.Mesh(bondGeometry, ghost ? ghostBondMaterial : bondMaterial);
    mesh.scale.set(0.08, direction.length(), 0.08);
    mesh.position.copy(a).addScaledVector(direction, 0.5);
    mesh.quaternion.setFromUnitVectors(up, direction.normalize());
    group.add(mesh);
  }

  group.scale.setScalar(fitRadius / radius);
  return group;
}
