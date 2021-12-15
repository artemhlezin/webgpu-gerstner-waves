export class Controls {
  x: number = 0;
  y: number = 0;
  private isMouseDown: boolean = false;

  constructor(public target: HTMLCanvasElement) {
    this.target = target;
  }

  register() {
    this.target.addEventListener("pointerdown", () => {
      this.onPointerDown();
    });
    this.target.addEventListener("pointermove", (e) => {
      this.onPointerMove(e);
    });
    this.target.addEventListener("pointerup", () => {
      this.onPointerUp();
    });
  }

  private onPointerDown() {
    this.isMouseDown = true;
  }

  onPointerMove(e: PointerEvent) {
    if (this.isMouseDown === true) {
      this.x -= e.movementX;
      this.y -= e.movementY;
    }
    this.y = Math.max(-90, Math.min(-10, this.y));
    this.x = this.x % 360;
  }

  onPointerUp() {
    if (this.isMouseDown === true) {
      this.isMouseDown = false;
    }
  }
}
