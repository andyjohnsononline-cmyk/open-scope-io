import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { deflateSync } from 'node:zlib';

// Inline CRC-32 (PNG uses ISO 3309 / ITU-T V.42 polynomial).
// node:zlib.crc32 requires Node 22+; CI runs Node 20.
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[i] = c;
}
function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CLI_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'cli',
  'dist',
  'index.js',
);

let testImagePath: string;

function createMinimalPng(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function makeChunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(typeAndData) >>> 0, 0);
    return Buffer.concat([len, typeAndData, checksum]);
  }

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: RGB (no alpha, simpler)
  const ihdr = makeChunk('IHDR', ihdrData);

  const rawRows = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 3);
    rawRows[rowOffset] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const px = rowOffset + 1 + x * 3;
      rawRows[px] = r;
      rawRows[px + 1] = g;
      rawRows[px + 2] = b;
    }
  }
  const idat = makeChunk('IDAT', deflateSync(rawRows));

  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function runCli(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(
      'node',
      [CLI_PATH, ...args],
      { timeout: 15000, maxBuffer: 50 * 1024 * 1024 },
      (err, stdout, stderr) => {
        resolve({
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          code: err?.code === undefined ? (err ? 1 : 0) : Number(err.code),
        });
      },
    );
  });
}

describe('CLI JSON contract', () => {
  beforeAll(() => {
    if (!existsSync(CLI_PATH)) {
      throw new Error(
        `CLI not built at ${CLI_PATH}. Run "pnpm build" first.`,
      );
    }

    testImagePath = join(tmpdir(), `openscope-test-${Date.now()}.png`);
    const png = createMinimalPng(4, 4, 255, 0, 0);
    writeFileSync(testImagePath, png);
  });

  afterAll(() => {
    if (testImagePath && existsSync(testImagePath)) {
      unlinkSync(testImagePath);
    }
  });

  it('outputs valid JSON with expected top-level shape', async () => {
    const { stdout, code } = await runCli(['analyze', testImagePath]);
    expect(code).toBe(0);
    const output = JSON.parse(stdout);

    expect(output).toHaveProperty('version', '1.0');
    expect(output).toHaveProperty('source', testImagePath);
    expect(output).toHaveProperty('colorSpace', 'sRGB');
    expect(output).toHaveProperty('frames');
    expect(Array.isArray(output.frames)).toBe(true);
    expect(output.frames.length).toBe(1);
  });

  it('frame has expected shape with all scope IDs', async () => {
    const { stdout } = await runCli(['analyze', testImagePath]);
    const output = JSON.parse(stdout);
    const frame = output.frames[0];

    expect(frame).toHaveProperty('index', 0);
    expect(frame).toHaveProperty('width', 4);
    expect(frame).toHaveProperty('height', 4);
    expect(frame).toHaveProperty('scopes');

    const expectedScopes = [
      'waveform',
      'rgbParade',
      'vectorscope',
      'histogram',
      'falseColor',
    ];
    for (const scope of expectedScopes) {
      expect(frame.scopes).toHaveProperty(scope);
    }
  });

  it('each scope result has dataShape array', async () => {
    const { stdout } = await runCli(['analyze', testImagePath]);
    const { frames } = JSON.parse(stdout);
    const scopes = frames[0].scopes;

    for (const [id, result] of Object.entries(scopes)) {
      const r = result as Record<string, unknown>;
      expect(r, `scope ${id} missing dataShape`).toHaveProperty('dataShape');
      expect(Array.isArray(r.dataShape), `scope ${id} dataShape is not array`).toBe(true);
    }
  });

  it('non-compact mode includes data arrays', async () => {
    const { stdout } = await runCli(['analyze', testImagePath]);
    const { frames } = JSON.parse(stdout);
    const scopes = frames[0].scopes;

    for (const [id, result] of Object.entries(scopes)) {
      const r = result as Record<string, unknown>;
      expect(r, `scope ${id} missing data`).toHaveProperty('data');
      expect(Array.isArray(r.data), `scope ${id} data is not array`).toBe(true);
    }
  });

  it('compact mode omits data arrays', async () => {
    const { stdout } = await runCli(['analyze', testImagePath, '--compact']);
    const { frames } = JSON.parse(stdout);
    const scopes = frames[0].scopes;

    for (const [id, result] of Object.entries(scopes)) {
      const r = result as Record<string, unknown>;
      expect(r, `scope ${id} should not have data in compact mode`).not.toHaveProperty('data');
      expect(r).toHaveProperty('dataShape');
    }
  });

  it('--scopes flag filters output', async () => {
    const { stdout } = await runCli([
      'analyze',
      testImagePath,
      '--scopes',
      'histogram,waveform',
    ]);
    const { frames } = JSON.parse(stdout);
    const scopeIds = Object.keys(frames[0].scopes);

    expect(scopeIds).toContain('histogram');
    expect(scopeIds).toContain('waveform');
    expect(scopeIds).not.toContain('vectorscope');
    expect(scopeIds).not.toContain('rgbParade');
    expect(scopeIds).not.toContain('falseColor');
  });

  it('exits with code 1 when requested scope is unavailable (partial results)', async () => {
    const { stdout, code } = await runCli([
      'analyze',
      testImagePath,
      '--scopes',
      'histogram,nonexistent_scope',
    ]);
    expect(code).toBe(1);
    const output = JSON.parse(stdout);
    expect(output.frames[0].scopes).toHaveProperty('histogram');
    expect(output.frames[0].scopes).not.toHaveProperty('nonexistent_scope');
  });

  it('exits with non-zero code on missing file', async () => {
    const { code, stderr } = await runCli(['analyze', '/nonexistent/file.png']);
    expect(code).not.toBe(0);
    expect(stderr).toContain('Error');
  });
});
