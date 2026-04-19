import { describe, it, expect, vi, beforeAll } from 'vitest';
import { GpuPipeline } from './gpu-pipeline.js';

beforeAll(() => {
  const g = globalThis as unknown as {
    GPUShaderStage?: { COMPUTE: number };
    GPUTextureUsage?: {
      TEXTURE_BINDING: number;
      COPY_DST: number;
      RENDER_ATTACHMENT: number;
    };
  };
  g.GPUShaderStage ??= { COMPUTE: 0x4 };
  g.GPUTextureUsage ??= {
    TEXTURE_BINDING: 0x4,
    COPY_DST: 0x2,
    RENDER_ATTACHMENT: 0x10,
  };
});

type MockTexture = { destroy: ReturnType<typeof vi.fn> };

function mockDevice() {
  const created: MockTexture[] = [];
  const createTexture = vi.fn((): MockTexture => {
    const tex: MockTexture = { destroy: vi.fn() };
    created.push(tex);
    return tex;
  });
  const device = {
    createBindGroupLayout: vi.fn(() => ({})),
    createTexture,
  } as unknown as GPUDevice;
  return { device, createTexture, created };
}

describe('GpuPipeline input texture cache', () => {
  it('reuses the input texture across same-dimension frames', () => {
    const { device, createTexture } = mockDevice();
    const pipeline = new GpuPipeline(device) as unknown as {
      getOrCreateInputTexture(w: number, h: number): unknown;
    };

    pipeline.getOrCreateInputTexture(1920, 1080);
    pipeline.getOrCreateInputTexture(1920, 1080);
    pipeline.getOrCreateInputTexture(1920, 1080);

    expect(createTexture).toHaveBeenCalledTimes(1);
  });

  it('recreates the input texture when dimensions change', () => {
    const { device, createTexture, created } = mockDevice();
    const pipeline = new GpuPipeline(device) as unknown as {
      getOrCreateInputTexture(w: number, h: number): unknown;
    };

    pipeline.getOrCreateInputTexture(1920, 1080);
    pipeline.getOrCreateInputTexture(3840, 2160);

    expect(createTexture).toHaveBeenCalledTimes(2);
    expect(created[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(created[1]!.destroy).not.toHaveBeenCalled();
  });

  it('destroys the cached input texture on destroy()', () => {
    const { device, createTexture, created } = mockDevice();
    const pipeline = new GpuPipeline(device);
    (pipeline as unknown as {
      getOrCreateInputTexture(w: number, h: number): unknown;
    }).getOrCreateInputTexture(1024, 768);

    expect(createTexture).toHaveBeenCalledTimes(1);
    pipeline.destroy();
    expect(created[0]!.destroy).toHaveBeenCalledTimes(1);
  });

  it('returns 0 new texture allocations across a warmed-up bench loop', () => {
    const { device, createTexture } = mockDevice();
    const pipeline = new GpuPipeline(device) as unknown as {
      getOrCreateInputTexture(w: number, h: number): unknown;
    };

    pipeline.getOrCreateInputTexture(7680, 4320);
    const allocsAfterWarmup = createTexture.mock.calls.length;

    for (let i = 0; i < 50; i++) {
      pipeline.getOrCreateInputTexture(7680, 4320);
    }

    expect(createTexture.mock.calls.length - allocsAfterWarmup).toBe(0);
  });
});
