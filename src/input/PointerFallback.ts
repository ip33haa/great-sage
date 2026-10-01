import type { CursorSource, CursorState } from './cursor';

export class PointerFallback implements CursorSource {
  readonly state: CursorState = { id: 'pointer', x: 0, y: 0, pressed: false, visible: false };
  readonly cursors = [this.state];

  constructor(private readonly element: HTMLElement) {
    element.addEventListener('pointermove', this.onMove);
    element.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointerup', this.onUp);
    element.addEventListener('pointerleave', this.onLeave);
  }

  private updatePosition(event: PointerEvent) {
    const rect = this.element.getBoundingClientRect();
    this.state.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.state.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    this.state.visible = true;
  }

  private onMove = (event: PointerEvent) => this.updatePosition(event);

  private onDown = (event: PointerEvent) => {
    this.updatePosition(event);
    this.state.pressed = true;
  };

  private onUp = () => {
    this.state.pressed = false;
  };

  private onLeave = () => {
    if (!this.state.pressed) this.state.visible = false;
  };

  dispose() {
    this.element.removeEventListener('pointermove', this.onMove);
    this.element.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointerup', this.onUp);
    this.element.removeEventListener('pointerleave', this.onLeave);
  }
}
