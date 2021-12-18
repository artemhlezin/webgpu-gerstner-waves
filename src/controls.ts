export class Controls {
  private isMouseDown: boolean = false;

  constructor(
    readonly target: HTMLCanvasElement,
    public x: number = 0,
    public y: number = 0
  ) {
    this.limitXY();
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

  private onPointerMove(e: PointerEvent) {
    if (this.isMouseDown === true) {
      this.x -= e.movementX;
      this.y -= e.movementY;
    }
    this.limitXY();
  }

  private onPointerUp() {
    if (this.isMouseDown === true) {
      this.isMouseDown = false;
    }
  }
  
  private limitXY() {
    this.y = Math.max(-90, Math.min(-10, this.y));
    this.x = this.x % 360;
  }
}
