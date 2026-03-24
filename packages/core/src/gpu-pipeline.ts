import { PluginRegistry } from './registry.js';
import type { FrameSource, Pipeline, PixelData, ScopePlugin, ScopeResult } from './types.js';

interface CachedResources {
  pipeline: GPUComputePipeline;
  outputBuffer: GPUBuffer;
  stagingBuffer: GPUBuffer;
  bufferSize: number;
  frameWidth: number;
  frameHeight: number;
}

export class GpuPipeline implements Pipeline {
  readonly mode = 'gpu' as const;
  private registry = new PluginRegistry();
  private cache = new Map<string, CachedResources>();
  private bindGroupLayout: GPUBindGroupLayout;

  constructor(private device: GPUDevice) {
    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          texture: { sampleType: 'float' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' },
        },
      ],
    });
  }

  register(plugin: ScopePlugin): void {
    this.registry.register(plugin);
  }

  async analyze(
    frame: FrameSource,
    scopeIds?: string[],
  ): Promise<Map<string, ScopeResult>> {
    const ids = scopeIds ?? this.registry.getIds();
    const texture = await this.createTexture(frame);
    const width = texture.width;
    const height = texture.height;

    const encoder = this.device.createCommandEncoder();
    const readbacks: Array<{
      id: string;
      staging: GPUBuffer;
      size: number;
    }> = [];

    for (const id of ids) {
      const plugin = this.registry.get(id);
      if (!plugin?.shader || !plugin.getBufferSize || !plugin.parseResult) {
        continue;
      }

      const res = this.getOrCreateResources(plugin, width, height);

      encoder.clearBuffer(res.outputBuffer);

      const bindGroup = this.device.createBindGroup({
        layout: this.bindGroupLayout,
        entries: [
          { binding: 0, resource: texture.createView() },
          { binding: 1, resource: { buffer: res.outputBuffer } },
        ],
      });

      const pass = encoder.beginComputePass();
      pass.setPipeline(res.pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(
        Math.ceil(width / 16),
        Math.ceil(height / 16),
      );
      pass.end();

      encoder.copyBufferToBuffer(
        res.outputBuffer,
        0,
        res.stagingBuffer,
        0,
        res.bufferSize,
      );

      readbacks.push({ id, staging: res.stagingBuffer, size: res.bufferSize });
    }

    this.device.pushErrorScope('validation');
    this.device.queue.submit([encoder.finish()]);
    const gpuError = await this.device.popErrorScope();
    if (gpuError) {
      texture.destroy();
      throw new Error(`WebGPU validation: ${gpuError.message}`);
    }

    const results = new Map<string, ScopeResult>();

    for (const { id, staging } of readbacks) {
      await staging.mapAsync(GPUMapMode.READ);
      const data = new Uint32Array(staging.getMappedRange().slice(0));
      staging.unmap();

      const plugin = this.registry.get(id)!;
      results.set(id, plugin.parseResult!(data, width, height));
    }

    texture.destroy();
    return results;
  }

  destroy(): void {
    for (const res of this.cache.values()) {
      res.outputBuffer.destroy();
      res.stagingBuffer.destroy();
    }
    this.cache.clear();
  }

  private getOrCreateResources(
    plugin: ScopePlugin,
    width: number,
    height: number,
  ): CachedResources {
    const cached = this.cache.get(plugin.id);
    if (cached && cached.frameWidth === width && cached.frameHeight === height) {
      return cached;
    }

    cached?.outputBuffer.destroy();
    cached?.stagingBuffer.destroy();

    const bufferSize = plugin.getBufferSize!(width, height) * 4; // u32 = 4 bytes

    const pipeline = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [this.bindGroupLayout],
      }),
      compute: {
        module: this.device.createShaderModule({ code: plugin.shader! }),
        entryPoint: 'main',
      },
    });

    const outputBuffer = this.device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });

    const stagingBuffer = this.device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const resources: CachedResources = {
      pipeline,
      outputBuffer,
      stagingBuffer,
      bufferSize,
      frameWidth: width,
      frameHeight: height,
    };

    this.cache.set(plugin.id, resources);
    return resources;
  }

  private async createTexture(frame: FrameSource): Promise<GPUTexture> {
    if ('data' in frame) {
      return this.createTextureFromPixels(frame as PixelData);
    }
    return this.createTextureFromBitmap(frame as ImageBitmap);
  }

  private createTextureFromBitmap(bitmap: ImageBitmap): GPUTexture {
    const texture = this.device.createTexture({
      size: [bitmap.width, bitmap.height],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.device.queue.copyExternalImageToTexture(
      { source: bitmap },
      { texture },
      [bitmap.width, bitmap.height],
    );

    return texture;
  }

  private createTextureFromPixels(pixels: PixelData): GPUTexture {
    const texture = this.device.createTexture({
      size: [pixels.width, pixels.height],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    const buf = new ArrayBuffer(pixels.data.byteLength);
    new Uint8Array(buf).set(pixels.data);
    this.device.queue.writeTexture(
      { texture },
      buf,
      { bytesPerRow: pixels.width * 4, rowsPerImage: pixels.height },
      [pixels.width, pixels.height],
    );

    return texture;
  }
}
