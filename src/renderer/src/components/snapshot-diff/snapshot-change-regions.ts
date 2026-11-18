/** One contiguous area of changed pixels, as tight bounds in image pixels. */
export type SnapshotChangeRegion = {
  x: number
  y: number
  width: number
  height: number
  changedPixels: number
}

// Why a grid, not per-pixel components: anti-aliased text changes as hundreds of
// detached specks, and a reviewer reads them as one changed line.
export const SNAPSHOT_REGION_CELL_PX = 8
export const MAX_SNAPSHOT_CHANGE_REGIONS = 24

type CellGrid = {
  columns: number
  rows: number
  /** Changed pixels per cell; 0 marks an untouched cell. */
  counts: Uint32Array
  minX: Int32Array
  minY: Int32Array
  maxX: Int32Array
  maxY: Int32Array
}

function createGrid(columns: number, rows: number): CellGrid {
  const size = columns * rows
  return {
    columns,
    rows,
    counts: new Uint32Array(size),
    minX: new Int32Array(size),
    minY: new Int32Array(size),
    maxX: new Int32Array(size),
    maxY: new Int32Array(size)
  }
}

function addToCell(
  grid: CellGrid,
  cell: number,
  count: number,
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
): void {
  if (grid.counts[cell] === 0) {
    grid.minX[cell] = bounds.minX
    grid.minY[cell] = bounds.minY
    grid.maxX[cell] = bounds.maxX
    grid.maxY[cell] = bounds.maxY
  } else {
    grid.minX[cell] = Math.min(grid.minX[cell], bounds.minX)
    grid.minY[cell] = Math.min(grid.minY[cell], bounds.minY)
    grid.maxX[cell] = Math.max(grid.maxX[cell], bounds.maxX)
    grid.maxY[cell] = Math.max(grid.maxY[cell], bounds.maxY)
  }
  grid.counts[cell] += count
}

function gridFromMask(mask: Uint8Array, width: number, height: number, cellSize: number): CellGrid {
  const grid = createGrid(Math.ceil(width / cellSize), Math.ceil(height / cellSize))
  const point = { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * width
    const cellRowStart = Math.floor(y / cellSize) * grid.columns
    for (let x = 0; x < width; x += 1) {
      if (mask[rowStart + x] === 0) {
        continue
      }
      point.minX = x
      point.maxX = x
      point.minY = y
      point.maxY = y
      addToCell(grid, cellRowStart + Math.floor(x / cellSize), 1, point)
    }
  }
  return grid
}

/** Halves the resolution, so areas up to one finer cell apart join. */
function coarsen(grid: CellGrid): CellGrid {
  const coarse = createGrid(Math.ceil(grid.columns / 2), Math.ceil(grid.rows / 2))
  const bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const cell = row * grid.columns + column
      if (grid.counts[cell] === 0) {
        continue
      }
      bounds.minX = grid.minX[cell]
      bounds.minY = grid.minY[cell]
      bounds.maxX = grid.maxX[cell]
      bounds.maxY = grid.maxY[cell]
      addToCell(
        coarse,
        Math.floor(row / 2) * coarse.columns + Math.floor(column / 2),
        grid.counts[cell],
        bounds
      )
    }
  }
  return coarse
}

/** Groups touching cells (diagonals included) into regions. */
function regionsOfGrid(grid: CellGrid): SnapshotChangeRegion[] {
  const { columns, rows, counts } = grid
  const visited = new Uint8Array(columns * rows)
  const stack: number[] = []
  const regions: SnapshotChangeRegion[] = []
  for (let start = 0; start < counts.length; start += 1) {
    if (counts[start] === 0 || visited[start] === 1) {
      continue
    }
    let minX = grid.minX[start]
    let minY = grid.minY[start]
    let maxX = grid.maxX[start]
    let maxY = grid.maxY[start]
    let changedPixels = 0
    visited[start] = 1
    stack.push(start)
    for (let cell = stack.pop(); cell !== undefined; cell = stack.pop()) {
      changedPixels += counts[cell]
      minX = Math.min(minX, grid.minX[cell])
      minY = Math.min(minY, grid.minY[cell])
      maxX = Math.max(maxX, grid.maxX[cell])
      maxY = Math.max(maxY, grid.maxY[cell])
      const row = Math.floor(cell / columns)
      const column = cell - row * columns
      for (let nextRow = row - 1; nextRow <= row + 1; nextRow += 1) {
        if (nextRow < 0 || nextRow >= rows) {
          continue
        }
        for (let nextColumn = column - 1; nextColumn <= column + 1; nextColumn += 1) {
          if (nextColumn < 0 || nextColumn >= columns) {
            continue
          }
          const next = nextRow * columns + nextColumn
          if (counts[next] !== 0 && visited[next] === 0) {
            visited[next] = 1
            stack.push(next)
          }
        }
      }
    }
    regions.push({
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      changedPixels
    })
  }
  return regions
}

/**
 * Contiguous areas of a changed-pixel mask (1 per changed pixel, row-major),
 * numbered in reading order. Past `maxRegions` the grid coarsens until the
 * areas fit, so a noisy diff yields a few large areas instead of a long list.
 */
export function findSnapshotChangeRegions(
  mask: Uint8Array,
  width: number,
  height: number,
  options: { cellSize?: number; maxRegions?: number } = {}
): SnapshotChangeRegion[] {
  if (width <= 0 || height <= 0 || mask.length < width * height) {
    return []
  }
  const maxRegions = Math.max(1, options.maxRegions ?? MAX_SNAPSHOT_CHANGE_REGIONS)
  let grid = gridFromMask(
    mask,
    width,
    height,
    Math.max(1, options.cellSize ?? SNAPSHOT_REGION_CELL_PX)
  )
  let regions = regionsOfGrid(grid)
  while (regions.length > maxRegions && (grid.columns > 1 || grid.rows > 1)) {
    grid = coarsen(grid)
    regions = regionsOfGrid(grid)
  }
  return regions.sort((left, right) => left.y - right.y || left.x - right.x)
}
