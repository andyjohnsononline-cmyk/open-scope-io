import { describe, it, expect } from 'vitest';
import { transposeColumnMajor } from './gl-textures.js';

describe('transposeColumnMajor', () => {
  it('transposes column-major data to row-major', () => {
    // 3 columns, 2 rows in column-major layout:
    // col0: [1,2], col1: [3,4], col2: [5,6]
    // Stored as: [1,2, 3,4, 5,6]
    const input = new Uint32Array([1, 2, 3, 4, 5, 6]);

    const result = transposeColumnMajor(input, 3, 2);

    // Row-major: row0=[1,3,5], row1=[2,4,6]
    expect(Array.from(result)).toEqual([1, 3, 5, 2, 4, 6]);
  });

  it('matches waveform analysis layout convention', () => {
    const cols = 4;
    const bins = 3;

    // Simulate waveform: data[col * bins + bin]
    const colMajor = new Uint32Array(cols * bins);
    for (let c = 0; c < cols; c++) {
      for (let b = 0; b < bins; b++) {
        colMajor[c * bins + b] = c * 100 + b;
      }
    }

    const rowMajor = transposeColumnMajor(colMajor, cols, bins);

    // After transpose, texImage2D row-major access:
    // row r, col c → rowMajor[r * cols + c] should equal colMajor[c * bins + r]
    for (let c = 0; c < cols; c++) {
      for (let b = 0; b < bins; b++) {
        expect(rowMajor[b * cols + c]).toBe(colMajor[c * bins + b]);
      }
    }
  });

  it('handles single column', () => {
    const input = new Uint32Array([10, 20, 30]);
    const result = transposeColumnMajor(input, 1, 3);
    expect(Array.from(result)).toEqual([10, 20, 30]);
  });

  it('handles single row', () => {
    const input = new Uint32Array([10, 20, 30]);
    const result = transposeColumnMajor(input, 3, 1);
    expect(Array.from(result)).toEqual([10, 20, 30]);
  });
});
