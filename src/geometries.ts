export class Plane {
  readonly indices: number[] = [];
  readonly vertecies: number[] = [];

  readonly positionOffset = 0;
  readonly normalOffset = 3;
  readonly uvOffset = 6;
  readonly stride = 8;

  constructor(
    readonly width: number = 1,
    readonly height: number = 1,
    private readonly rows: number = 10,
    private readonly columns: number = 10
  ) {
    this.rows = Math.floor(rows) || 1;
    this.columns = Math.floor(columns) || 1;
    this.generateVertecies();
    this.generateIndices();
  }

  private generateVertecies() {
    for (let row = 0; row <= this.rows; row++) {
      let rowHeight = this.height / this.rows;
      const y = row * rowHeight;

      for (let col = 0; col <= this.columns; col++) {
        let colWidth = this.width / this.columns;
        const x = col * colWidth;

        this.vertecies.push(x, y, 0);
        this.vertecies.push(0, 0, 1);
        this.vertecies.push(col / this.columns, 1 - row / this.rows);
      }
    }
  }

  private generateIndices() {
    const columnsOffset = this.columns + 1;

    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.columns; col++) {
        const leftBottom = columnsOffset * row + col;
        const rightBottom = columnsOffset * row + (col + 1);
        const leftUp = columnsOffset * (row + 1) + col;
        const rightUp = columnsOffset * (row + 1) + (col + 1);

        // CCW frontface
        this.indices.push(leftUp, leftBottom, rightBottom);
        this.indices.push(rightUp, leftUp, rightBottom);
      }
    }
  }
}
