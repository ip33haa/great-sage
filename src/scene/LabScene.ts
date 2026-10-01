import * as THREE from 'three';
import { COMPOUNDS_BY_ID, prettyFormula, type Compound } from '../data/compounds';
import { CATEGORY_COLORS, ELEMENTS, type ChemicalElement } from '../data/elements';
import type { CursorSource, CursorState } from '../input/cursor';
import { describeMissing, matchRecipe } from '../logic/recipeMatcher';
import { useLabStore, type ReactionEvent } from '../store/labStore';
import { atomColor, buildMolecule, createAtomMesh } from './MoleculeBuilder';

const TILE = 1;
const SPACING = 1.1;
const CURSOR_Z = 1.6;
const REACTOR_POS = new THREE.Vector3(0, -6.3, 0.8);
const REACTOR_RADIUS = 1.8;
const REACTOR_DROP_RADIUS = 3;
/** Hand-friendly picking: the cursor snaps to the nearest tile within this distance, and keeps it a little longer. */
const TILE_SNAP_RADIUS = 0.8;
const TILE_STICKY_RADIUS = 1;
/** A pinch still grabs the tile hovered this recently, since the cursor can slip while the fingers close. */
const PICK_GRACE_MS = 350;
/** Centre of the empty block above the transition metals (columns 3-12, rows 1-3). */
const PREVIEW_POS = new THREE.Vector3(-2.2, 5.1, 0.6);
const PREVIEW_MOLECULE_X = -3.1;
const PREVIEW_LABEL_X = 1.7;
const VIEW_WIDTH = 21.5;
const VIEW_HEIGHT = 18.6;
const VIEW_CENTER_Y = -1.1;
const FOV = 40;

type ButtonAction = 'react' | 'clear';

interface TileData {
  element: ChemicalElement;
  base: THREE.Vector3;
  hover: number;
}

interface HandInteraction {
  ring: THREE.Mesh;
  color: string;
  world: THREE.Vector3;
  held: { symbol: string; object: THREE.Group } | null;
  hoveredTile: THREE.Mesh | null;
  hoveredButton: THREE.Mesh | null;
  wasPressed: boolean;
  lastTile: THREE.Mesh | null;
  lastTileAt: number;
}

const CURSOR_COLORS: Record<string, string> = { 'hand-0': '#67e8f9', 'hand-1': '#f9a8d4', pointer: '#f8fafc' };

interface FloatingAtom {
  mesh: THREE.Object3D;
  velocity: THREE.Vector3;
  life: number;
}

interface Burst {
  points: THREE.Points;
  velocities: Float32Array;
  life: number;
}

export interface LabSceneOptions {
  onHoverElement?: (element: ChemicalElement | null) => void;
  onPickUp?: (element: ChemicalElement) => void;
}

function tileTexture(element: ChemicalElement): THREE.CanvasTexture {
  const size = 192;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const base = CATEGORY_COLORS[element.category];
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, base);
  gradient.addColorStop(1, shade(base, -0.35));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, size - 6, size - 6);

  ctx.fillStyle = 'rgba(15,23,42,0.85)';
  ctx.font = '600 30px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(String(element.number), 14, 12);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 84px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#0f172a';
  ctx.fillText(element.symbol, size / 2, size / 2 + 4);

  ctx.font = '600 22px Inter, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(15,23,42,0.8)';
  ctx.fillText(element.name, size / 2, size - 24, size - 16);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function shade(hex: string, amount: number): string {
  const color = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  color.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amount * hsl.l)));
  return `#${color.getHexString()}`;
}

class TextLabel {
  readonly sprite: THREE.Sprite;
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private text = '';

  constructor(private readonly worldWidth: number, width = 1024, height = 160) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false }));
    this.sprite.scale.set(worldWidth, (worldWidth * height) / width, 1);
  }

  set(text: string, color = '#f8fafc', sub = '') {
    const key = `${text}|${color}|${sub}`;
    if (key === this.text) return;
    this.text = key;
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = color;
    ctx.font = `800 ${sub ? 64 : 72}px Inter, system-ui, sans-serif`;
    ctx.fillText(text, canvas.width / 2, sub ? canvas.height * 0.36 : canvas.height / 2, canvas.width - 20);
    if (sub) {
      ctx.font = '600 40px Inter, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(226,232,240,0.85)';
      ctx.fillText(sub, canvas.width / 2, canvas.height * 0.78, canvas.width - 20);
    }
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
    (this.sprite.material as THREE.SpriteMaterial).dispose();
  }
}

function symbolSprite(symbol: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 64px Inter, system-ui, sans-serif';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.strokeText(symbol, 64, 68);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(symbol, 64, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.setScalar(0.9);
  sprite.renderOrder = 10;
  return sprite;
}

function labeledAtom(symbol: string, scale = 1.4): THREE.Group {
  const group = new THREE.Group();
  const mesh = createAtomMesh(symbol);
  mesh.scale.multiplyScalar(scale);
  group.add(mesh);
  group.add(symbolSprite(symbol));
  return group;
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Sprite) {
      const material = child.material as THREE.SpriteMaterial;
      material.map?.dispose();
      material.dispose();
    }
  });
}

export class LabScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
  private readonly raycaster = new THREE.Raycaster();
  private readonly cursorPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -CURSOR_Z);
  private readonly tilePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private readonly tilePoint = new THREE.Vector3();
  private readonly timer = new THREE.Timer();
  private readonly resizeObserver: ResizeObserver;
  private readonly unsubscribe: () => void;
  private frame = 0;

  private readonly tiles: THREE.Mesh[] = [];
  private readonly buttons: THREE.Mesh[] = [];
  private readonly reactor = new THREE.Group();
  private readonly reactorRing: THREE.Mesh;
  private readonly reactorDisc: THREE.Mesh;
  private readonly reactorLight: THREE.PointLight;
  private readonly reactorAtoms = new THREE.Group();
  private readonly preview = new THREE.Group();
  private readonly previewLabel = new TextLabel(6.4, 1024, 200);
  private readonly reactorLabel = new TextLabel(6);
  private readonly ringGeometry = new THREE.RingGeometry(0.22, 0.32, 32);

  private previewMolecule: THREE.Group | null = null;
  private previewKey = '';
  private showcase: { compound: Compound; until: number } | null = null;
  private readonly hands = new Map<string, HandInteraction>();
  private hoveredTiles = new Set<THREE.Mesh>();
  private hoveredButtons = new Set<THREE.Mesh>();
  private reportedTile: THREE.Mesh | null = null;
  private floating: FloatingAtom[] = [];
  private bursts: Burst[] = [];
  private shake = 0;
  private pulse = 0;

  private readonly ndc = new THREE.Vector2();

  constructor(
    private readonly container: HTMLElement,
    private readonly cursor: CursorSource,
    private readonly options: LabSceneOptions = {},
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';

    this.scene.background = new THREE.Color('#0b1020');
    this.scene.fog = new THREE.Fog('#0b1020', 40, 90);

    this.scene.add(new THREE.HemisphereLight('#c7d2fe', '#1e1b4b', 1.1));
    const key = new THREE.DirectionalLight('#ffffff', 1.6);
    key.position.set(6, 10, 14);
    this.scene.add(key);

    this.buildTable();
    ({ ring: this.reactorRing, disc: this.reactorDisc, light: this.reactorLight } = this.buildReactor());
    this.buildButtons();
    this.buildPreview();
    this.buildBackdrop();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    this.unsubscribe = useLabStore.subscribe((state, previous) => {
      if (state.reactor !== previous.reactor) this.syncReactor(state.reactor);
      if (state.lastReaction && state.lastReaction !== previous.lastReaction) this.playReaction(state.lastReaction);
    });
    this.syncReactor(useLabStore.getState().reactor);

    this.animate();
  }

  // ---------------------------------------------------------------- build

  private buildTable() {
    const geometry = new THREE.BoxGeometry(TILE, TILE, 0.18);
    for (const element of ELEMENTS) {
      const side = new THREE.MeshStandardMaterial({ color: shade(CATEGORY_COLORS[element.category], -0.4), roughness: 0.6 });
      const front = new THREE.MeshStandardMaterial({ map: tileTexture(element), roughness: 0.45, emissive: '#ffffff', emissiveIntensity: 0 });
      const mesh = new THREE.Mesh(geometry, [side, side, side, side, front, side]);
      const y = element.row <= 7 ? 6.2 - (element.row - 1) * SPACING : -0.4 - SPACING * (element.row - 6.5);
      const base = new THREE.Vector3((element.column - 9.5) * SPACING, y, 0);
      mesh.position.copy(base);
      mesh.userData = { element, base, hover: 0 } satisfies TileData;
      this.tiles.push(mesh);
      this.scene.add(mesh);
    }
  }

  private buildReactor() {
    this.reactor.position.copy(REACTOR_POS);
    this.scene.add(this.reactor);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(REACTOR_RADIUS, 0.12, 16, 96),
      new THREE.MeshStandardMaterial({ color: '#22d3ee', emissive: '#22d3ee', emissiveIntensity: 1.2, roughness: 0.3 }),
    );
    this.reactor.add(ring);

    const outer = new THREE.Mesh(
      new THREE.TorusGeometry(REACTOR_RADIUS + 0.35, 0.04, 8, 96),
      new THREE.MeshBasicMaterial({ color: '#67e8f9', transparent: true, opacity: 0.5 }),
    );
    this.reactor.add(outer);

    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(REACTOR_RADIUS - 0.05, 64),
      new THREE.MeshBasicMaterial({ color: '#0e7490', transparent: true, opacity: 0.35, depthWrite: false }),
    );
    disc.position.z = -0.3;
    this.reactor.add(disc);

    const light = new THREE.PointLight('#22d3ee', 6, 12, 1.5);
    light.position.set(0, 0, 2);
    this.reactor.add(light);

    this.reactor.add(this.reactorAtoms);

    this.reactorLabel.sprite.position.set(0, -REACTOR_RADIUS - 0.75, 0.5);
    this.reactor.add(this.reactorLabel.sprite);
    return { ring, disc, light };
  }

  private buildButtons() {
    const make = (action: ButtonAction, label: string, color: string, x: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 192;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 512, 192);
      ctx.fillStyle = '#0b1020';
      ctx.font = '900 96px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 256, 100);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const side = new THREE.MeshStandardMaterial({ color: shade(color, -0.4) });
      const front = new THREE.MeshStandardMaterial({ map: texture, emissive: color, emissiveIntensity: 0.15 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.98, 0.3), [side, side, side, side, front, side]);
      mesh.position.set(x, REACTOR_POS.y, REACTOR_POS.z);
      mesh.userData = { action, base: mesh.position.clone(), hover: 0 };
      this.buttons.push(mesh);
      this.scene.add(mesh);
    };
    make('clear', 'CLEAR', '#fca5a5', -4.4);
    make('react', 'REACT', '#86efac', 4.4);
  }

  private buildPreview() {
    this.preview.position.copy(PREVIEW_POS);
    this.scene.add(this.preview);

    const halo = new THREE.Mesh(
      new THREE.RingGeometry(1.45, 1.52, 64),
      new THREE.MeshBasicMaterial({ color: '#a78bfa', transparent: true, opacity: 0.7, depthWrite: false }),
    );
    halo.position.set(PREVIEW_MOLECULE_X, 0, -0.4);
    this.preview.add(halo);

    const backdrop = new THREE.Mesh(
      new THREE.CircleGeometry(1.45, 64),
      new THREE.MeshBasicMaterial({ color: '#1e1b4b', transparent: true, opacity: 0.55, depthWrite: false }),
    );
    backdrop.position.set(PREVIEW_MOLECULE_X, 0, -0.45);
    this.preview.add(backdrop);

    this.previewLabel.sprite.position.set(PREVIEW_LABEL_X, 0, 0);
    this.preview.add(this.previewLabel.sprite);
  }

  private buildBackdrop() {
    const grid = new THREE.GridHelper(80, 80, '#1e293b', '#172036');
    grid.position.set(0, -9.5, 0);
    this.scene.add(grid);

    const count = 400;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 80;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 50;
      positions[i * 3 + 2] = -10 - Math.random() * 30;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#64748b', size: 0.12 })));
  }

  // ---------------------------------------------------------------- store sync

  private syncReactor(reactor: Record<string, number>) {
    for (const child of [...this.reactorAtoms.children]) {
      disposeObject(child);
      this.reactorAtoms.remove(child);
    }
    const symbols = Object.entries(reactor).flatMap(([symbol, n]) => Array(n).fill(symbol) as string[]);
    symbols.forEach((symbol, index) => {
      const atom = labeledAtom(symbol, 0.9);
      atom.userData = { angle: (index / Math.max(1, symbols.length)) * Math.PI * 2, orbit: 0.5 + (index % 3) * 0.4, speed: 0.5 + (index % 4) * 0.15 };
      atom.scale.setScalar(symbols.length > 12 ? 0.7 : 1);
      this.reactorAtoms.add(atom);
    });

    const count = symbols.length;
    this.reactorLabel.set(count === 0 ? 'Drop elements here' : `${count} atom${count === 1 ? '' : 's'}`, count === 0 ? '#94a3b8' : '#e0f2fe');
    this.refreshPreview();
  }

  private refreshPreview() {
    const reactor = useLabStore.getState().reactor;
    const isEmpty = Object.keys(reactor).length === 0;

    if (isEmpty && this.showcase && performance.now() < this.showcase.until) {
      const { compound } = this.showcase;
      this.setPreview(`show:${compound.id}`, compound, false);
      this.previewLabel.set(`${prettyFormula(compound.formula)}  ${compound.name}`, '#fde68a', 'Created!');
      return;
    }

    const result = matchRecipe(reactor);
    switch (result.kind) {
      case 'empty':
        this.setPreview('empty', null, false);
        this.previewLabel.set('Preview', '#94a3b8', 'Pinch an element and drop it in the reactor');
        break;
      case 'exact':
        this.setPreview(`exact:${result.compound.id}`, result.compound, false);
        this.previewLabel.set(`${prettyFormula(result.compound.formula)}  ${result.compound.name}`, '#86efac', 'Ready! Hit REACT');
        break;
      case 'partial':
        this.setPreview(`partial:${result.compound.id}`, result.compound, true);
        this.previewLabel.set(
          `${prettyFormula(result.compound.formula)}  ${result.compound.name}?`,
          '#fcd34d',
          `Needs ${describeMissing(result.missing)}`,
        );
        break;
      case 'none':
        this.setPreview('none', null, false);
        this.previewLabel.set('No known compound', '#fca5a5', 'Try a different mix');
        break;
    }
  }

  private setPreview(key: string, compound: Compound | null, ghost: boolean) {
    if (key === this.previewKey) return;
    this.previewKey = key;
    if (this.previewMolecule) {
      this.preview.remove(this.previewMolecule);
      this.previewMolecule = null;
    }
    if (compound) {
      this.previewMolecule = buildMolecule(compound, { ghost, fitRadius: 1.3 });
      this.previewMolecule.position.x = PREVIEW_MOLECULE_X;
      this.preview.add(this.previewMolecule);
    }
  }

  private playReaction(event: ReactionEvent) {
    if (event.kind === 'success' && event.compoundId) {
      const compound = COMPOUNDS_BY_ID[event.compoundId];
      this.showcase = { compound, until: performance.now() + 6000 };
      this.previewKey = '';
      this.refreshPreview();
      this.pulse = 1;
      this.spawnBurst(REACTOR_POS, event.isNew ? '#fde047' : '#86efac', event.isNew ? 220 : 120);
      this.spawnBurst(PREVIEW_POS.clone().setX(PREVIEW_POS.x + PREVIEW_MOLECULE_X), '#c4b5fd', 80);
    } else {
      this.shake = 1;
      this.spawnBurst(REACTOR_POS, '#f87171', 90);
    }
  }

  private spawnBurst(origin: THREE.Vector3, color: string, count: number) {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions.set([origin.x, origin.y, origin.z + 0.5], i * 3);
      const direction = new THREE.Vector3().randomDirection().multiplyScalar(2 + Math.random() * 5);
      velocities.set([direction.x, direction.y, direction.z], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ color, size: 0.18, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.scene.add(points);
    this.bursts.push({ points, velocities, life: 1 });
  }

  // ---------------------------------------------------------------- input

  private handleInput() {
    const active = new Set<string>();
    for (const cursor of this.cursor.cursors) {
      active.add(cursor.id);
      this.updateHand(this.handFor(cursor.id), cursor);
    }
    for (const [id, hand] of this.hands) {
      if (!active.has(id)) this.releaseHand(hand);
    }

    this.hoveredTiles = new Set();
    this.hoveredButtons = new Set();
    let reported: THREE.Mesh | null = null;
    for (const hand of this.hands.values()) {
      if (hand.hoveredTile) {
        this.hoveredTiles.add(hand.hoveredTile);
        reported ??= hand.hoveredTile;
      }
      if (hand.hoveredButton) this.hoveredButtons.add(hand.hoveredButton);
    }
    if (reported !== this.reportedTile) {
      this.reportedTile = reported;
      this.options.onHoverElement?.(reported ? (reported.userData as TileData).element : null);
    }
  }

  private handFor(id: string): HandInteraction {
    let hand = this.hands.get(id);
    if (!hand) {
      const color = CURSOR_COLORS[id] ?? '#f8fafc';
      const ring = new THREE.Mesh(
        this.ringGeometry,
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false }),
      );
      ring.renderOrder = 20;
      this.scene.add(ring);
      hand = {
        ring,
        color,
        world: new THREE.Vector3(),
        held: null,
        hoveredTile: null,
        hoveredButton: null,
        wasPressed: false,
        lastTile: null,
        lastTileAt: 0,
      };
      this.hands.set(id, hand);
    }
    return hand;
  }

  private releaseHand(hand: HandInteraction) {
    hand.ring.visible = false;
    hand.hoveredTile = null;
    hand.hoveredButton = null;
    hand.wasPressed = false;
    this.dropHeld(hand, false);
  }

  private updateHand(hand: HandInteraction, state: CursorState) {
    hand.ring.visible = true;
    this.ndc.set(state.x, state.y);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    this.raycaster.ray.intersectPlane(this.cursorPlane, hand.world);
    hand.ring.position.copy(hand.world);

    const overReactor = this.isOverReactor(hand.world);
    (hand.ring.material as THREE.MeshBasicMaterial).color.set(
      state.pressed ? '#fde047' : overReactor && hand.held ? '#22d3ee' : hand.color,
    );
    hand.ring.scale.setScalar(state.pressed ? 0.75 : 1);

    const now = performance.now();
    if (!hand.held) {
      const buttonHit = this.raycaster.intersectObjects(this.buttons, false)[0];
      hand.hoveredButton = (buttonHit?.object as THREE.Mesh) ?? null;
      hand.hoveredTile = hand.hoveredButton ? null : this.tileNear(hand.hoveredTile);
      if (hand.hoveredTile) {
        hand.lastTile = hand.hoveredTile;
        hand.lastTileAt = now;
      }
    } else {
      hand.hoveredTile = null;
      hand.hoveredButton = null;
    }

    const justPressed = state.pressed && !hand.wasPressed;
    const justReleased = !state.pressed && hand.wasPressed;
    hand.wasPressed = state.pressed;

    if (justPressed) {
      const tile = hand.hoveredTile ?? (now - hand.lastTileAt < PICK_GRACE_MS ? hand.lastTile : null);
      if (tile && !hand.hoveredButton) {
        hand.hoveredTile = null;
        hand.lastTile = null;
        this.pickUp(hand, (tile.userData as TileData).element);
      } else if (hand.hoveredButton) {
        this.pressButton(hand.hoveredButton);
      }
    }

    if (hand.held) {
      hand.held.object.position.lerp(hand.world, 0.5);
      hand.held.object.rotation.y += 0.04;
      if (justReleased) this.dropHeld(hand, overReactor);
    }
  }

  /** Tile under the cursor, snapping to the nearest one and favouring the tile that is already hovered. */
  private tileNear(current: THREE.Mesh | null): THREE.Mesh | null {
    const direct = this.raycaster.intersectObjects(this.tiles, false)[0]?.object as THREE.Mesh | undefined;
    if (!this.raycaster.ray.intersectPlane(this.tilePlane, this.tilePoint)) return direct ?? null;
    const distance = (tile: THREE.Mesh) => {
      const base = (tile.userData as TileData).base;
      return Math.hypot(base.x - this.tilePoint.x, base.y - this.tilePoint.y);
    };
    if (current && distance(current) < TILE_STICKY_RADIUS && (!direct || direct === current || distance(direct) > 0.45)) {
      return current;
    }
    if (direct) return direct;
    let best: THREE.Mesh | null = null;
    let bestDistance = TILE_SNAP_RADIUS;
    for (const tile of this.tiles) {
      const d = distance(tile);
      if (d < bestDistance) {
        best = tile;
        bestDistance = d;
      }
    }
    return best;
  }

  private isOverReactor(world: THREE.Vector3) {
    return Math.hypot(world.x - REACTOR_POS.x, world.y - REACTOR_POS.y) < REACTOR_DROP_RADIUS;
  }

  private pickUp(hand: HandInteraction, element: ChemicalElement) {
    const object = labeledAtom(element.symbol);
    object.position.copy(hand.world);
    this.scene.add(object);
    hand.held = { symbol: element.symbol, object };
    this.options.onPickUp?.(element);
  }

  private dropHeld(hand: HandInteraction, intoReactor: boolean) {
    if (!hand.held) return;
    const { symbol, object } = hand.held;
    hand.held = null;
    const added = intoReactor && useLabStore.getState().addAtom(symbol);
    if (added) {
      this.scene.remove(object);
      disposeObject(object);
      this.spawnBurst(REACTOR_POS, atomColor(symbol), 30);
    } else {
      this.floating.push({ mesh: object, velocity: new THREE.Vector3(0, -2, 0), life: 1 });
    }
  }

  private pressButton(button: THREE.Mesh) {
    button.userData.hover = -1;
    const store = useLabStore.getState();
    if (button.userData.action === 'react') store.react();
    else store.clearReactor();
  }

  // ---------------------------------------------------------------- loop

  private animate = (timestamp?: number) => {
    this.frame = requestAnimationFrame(this.animate);
    this.timer.update(timestamp);
    const dt = Math.min(this.timer.getDelta(), 0.05);
    const t = this.timer.getElapsed();

    this.handleInput();

    for (const tile of this.tiles) {
      const data = tile.userData as TileData;
      const target = this.hoveredTiles.has(tile) ? 1 : 0;
      data.hover += (target - data.hover) * Math.min(1, dt * 14);
      tile.position.z = data.base.z + data.hover * 0.6;
      tile.scale.setScalar(1 + data.hover * 0.25);
      ((tile.material as THREE.Material[])[4] as THREE.MeshStandardMaterial).emissiveIntensity = data.hover * 0.25;
    }

    for (const button of this.buttons) {
      const target = this.hoveredButtons.has(button) ? 1 : 0;
      button.userData.hover += (target - button.userData.hover) * Math.min(1, dt * 10);
      button.position.z = button.userData.base.z + button.userData.hover * 0.3;
      button.scale.setScalar(1 + Math.max(0, button.userData.hover) * 0.08);
    }

    const heldOver = [...this.hands.values()].some((hand) => hand.held && this.isOverReactor(hand.world));
    const glow = 1.2 + Math.sin(t * 3) * 0.2 + (heldOver ? 1.5 : 0) + this.pulse * 3;
    (this.reactorRing.material as THREE.MeshStandardMaterial).emissiveIntensity = glow;
    this.reactorLight.intensity = 4 + glow * 2;
    (this.reactorDisc.material as THREE.MeshBasicMaterial).opacity = 0.3 + (heldOver ? 0.25 : 0) + this.pulse * 0.4;
    this.reactorRing.rotation.z += dt * 0.4;
    this.pulse = Math.max(0, this.pulse - dt * 1.2);

    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.reactor.position.x = REACTOR_POS.x + Math.sin(t * 60) * this.shake * 0.25;

    for (const atom of this.reactorAtoms.children) {
      const { angle, orbit, speed } = atom.userData;
      const a = angle + t * speed;
      atom.position.set(Math.cos(a) * orbit, Math.sin(a) * orbit, Math.sin(a * 2) * 0.2);
    }

    if (this.showcase && performance.now() >= this.showcase.until) {
      this.showcase = null;
      this.refreshPreview();
    }
    if (this.previewMolecule) {
      this.previewMolecule.rotation.y += dt * 0.6;
      this.previewMolecule.rotation.x = Math.sin(t * 0.5) * 0.25;
    }
    this.preview.position.y = PREVIEW_POS.y + Math.sin(t * 1.4) * 0.08;

    this.floating = this.floating.filter((item) => {
      item.life -= dt * 1.5;
      item.velocity.y -= dt * 9;
      item.mesh.position.addScaledVector(item.velocity, dt);
      item.mesh.scale.setScalar(Math.max(0.01, item.life));
      if (item.life <= 0) {
        this.scene.remove(item.mesh);
        disposeObject(item.mesh);
        return false;
      }
      return true;
    });

    this.bursts = this.bursts.filter((burst) => {
      burst.life -= dt * 0.9;
      const attribute = burst.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const array = attribute.array as Float32Array;
      for (let i = 0; i < array.length; i += 3) {
        array[i] += burst.velocities[i] * dt;
        array[i + 1] += burst.velocities[i + 1] * dt;
        array[i + 2] += burst.velocities[i + 2] * dt;
        burst.velocities[i + 1] -= dt * 3;
      }
      attribute.needsUpdate = true;
      (burst.points.material as THREE.PointsMaterial).opacity = Math.max(0, burst.life);
      if (burst.life <= 0) {
        this.scene.remove(burst.points);
        burst.points.geometry.dispose();
        (burst.points.material as THREE.Material).dispose();
        return false;
      }
      return true;
    });

    this.renderer.render(this.scene, this.camera);
  };

  private resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height);
    const aspect = width / height;
    this.camera.aspect = aspect;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const distance = Math.max(VIEW_HEIGHT / 2 / tanHalf, VIEW_WIDTH / 2 / (tanHalf * aspect));
    this.camera.position.set(0, VIEW_CENTER_Y + 0.6, distance);
    this.camera.lookAt(0, VIEW_CENTER_Y, 0);
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.timer.dispose();
    this.resizeObserver.disconnect();
    this.unsubscribe();
    this.previewLabel.dispose();
    this.reactorLabel.dispose();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          (material as THREE.MeshStandardMaterial).map?.dispose();
          material.dispose();
        }
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
