import { mat4 } from "gl-matrix";
import { loadImage } from "./utils";

import vertexShaderSource from "./shaders/shader.vert.wgsl";
import fragmentShaderSource from "./shaders/shader.frag.wgsl";
import logoUrl from "./images/webgpu-logo.webp";

async function main(): Promise<void> {
  // Setup device
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) {
    throw "Could not retrieve a WebGPU adapter.";
  }
  const device = await adapter.requestDevice();

  // Setup swapchain
  const canvas: HTMLCanvasElement = document.querySelector("#gpuCanvas")!;
  const context: GPUCanvasContext = canvas.getContext("webgpu")!;
  const presentationFormat = context.getPreferredFormat(adapter);
  context.configure({
    device: device,
    format: presentationFormat,
  });
  const sampleCount = 4;

  // Create shader modules
  const vertexShaderModule = device.createShaderModule({
    code: vertexShaderSource,
  });
  const fragmentShaderModule = device.createShaderModule({
    code: fragmentShaderSource,
  });

  // Quad geometry data
  // prettier-ignore
  const vertexData = new Float32Array([
    // position       // color       // UV 
    -0.5, -0.5, 0.0,  1.0, 0.0, 0.0, 0.0, 1.0,
     0.5, -0.5, 0.0,  0.0, 1.0, 0.0, 1.0, 1.0,
    -0.5,  0.5, 0.0,  0.0, 0.0, 1.0, 0.0, 0.0,
     0.5,  0.5, 0.0,  1.0, 1.0, 1.0, 1.0, 0.0,
  ]);
  const indexData = new Uint32Array([0, 1, 2, 1, 3, 2]);

  // Create quad geometry vertex/index buffers
  const vertexBuffer = device.createBuffer({
    size: (3 + 3 + 2) * 4 * Float32Array.BYTES_PER_ELEMENT, // (position + color + uv) * vertex count * bytes per element
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });
  new Float32Array(vertexBuffer.getMappedRange()).set(vertexData);
  vertexBuffer.unmap();

  const indexBuffer = device.createBuffer({
    size: indexData.byteLength,
    usage: GPUBufferUsage.INDEX,
    mappedAtCreation: true,
  });
  new Uint32Array(indexBuffer.getMappedRange()).set(indexData);
  indexBuffer.unmap();

  const vertexBufferLayout: GPUVertexBufferLayout = {
    arrayStride: (3 + 3 + 2) * Float32Array.BYTES_PER_ELEMENT, // (position + color + uv) * bytes per element
    attributes: [
      {
        format: "float32x3",
        offset: 0,
        shaderLocation: 0,
      },
      {
        format: "float32x3",
        offset: 3 * Float32Array.BYTES_PER_ELEMENT,
        shaderLocation: 1,
      },
      {
        format: "float32x2",
        offset: (3 + 3) * Float32Array.BYTES_PER_ELEMENT,
        shaderLocation: 2,
      },
    ],
  };

  // Create transformation buffer
  const transformModelBuffer = device.createBuffer({
    size: 16 * Float32Array.BYTES_PER_ELEMENT, // mat4x4<f32>
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Create transformation bind group and bind group layout
  const transformBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: "uniform" },
      },
    ],
  });
  const transformBindGroup = device.createBindGroup({
    layout: transformBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          buffer: transformModelBuffer,
        },
      },
    ],
  });

  // Load image and copy it to the GPUTexture
  const logo = await loadImage(logoUrl);
  const logoGPUTexture = device.createTexture({
    size: [logo.width, logo.height],
    format: presentationFormat,
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture(
    { source: logo },
    { texture: logoGPUTexture },
    [logo.width, logo.height]
  );

  // Create textures bind group and bind group layout
  const texturesBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: "filtering" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: "float" },
      },
    ],
  });
  const texturesBindGroup = device.createBindGroup({
    layout: texturesBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: device.createSampler({
          addressModeU: "repeat",
          addressModeV: "repeat",
          magFilter: "linear",
          minFilter: "linear",
        }),
      },
      {
        binding: 1,
        resource: logoGPUTexture.createView(),
      },
    ],
  });

  // Create pipeline layout from bind group layouts
  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [transformBindGroupLayout, texturesBindGroupLayout],
  });

  // Create render pipeline
  const renderPipelineDescriptor: GPURenderPipelineDescriptor = {
    layout: pipelineLayout,
    vertex: {
      module: vertexShaderModule,
      entryPoint: "main",
      buffers: [vertexBufferLayout],
    },
    fragment: {
      module: fragmentShaderModule,
      entryPoint: "main",
      targets: [{ format: presentationFormat }],
    },
    multisample: { count: sampleCount },
  };
  const renderPipeline = device.createRenderPipeline(renderPipelineDescriptor);

  // Create attachment for multisampling support
  const texture = device.createTexture({
    size: {
      width: canvas.width,
      height: canvas.height,
    },
    sampleCount: sampleCount,
    format: presentationFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const view = texture.createView();

  requestAnimationFrame(function draw(timestamp: number) {
    // Create render pass descriptor
    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view,
          resolveTarget: context.getCurrentTexture().createView(),
          loadValue: {
            r: Math.sin(timestamp * 0.001) * 0.5 + 0.5,
            g: 0.5,
            b: 1.0,
            a: 1.0,
          },
          storeOp: "store",
        },
      ],
    };

    // Create and update translate matrix
    const transformMatrix = mat4.create();
    // const rot = (timestamp * 0.1 * Math.PI) / 180;
    const rot = (30 * Math.PI) / 180;
    mat4.rotateZ(transformMatrix, transformMatrix, rot);

    // Update buffers
    device.queue.writeBuffer(
      transformModelBuffer,
      0,
      transformMatrix as ArrayBuffer
    );

    const commandEncoder = device!.createCommandEncoder();

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(renderPipeline);
    passEncoder.setVertexBuffer(0, vertexBuffer);
    passEncoder.setIndexBuffer(indexBuffer, "uint32");
    passEncoder.setBindGroup(0, transformBindGroup);
    passEncoder.setBindGroup(1, texturesBindGroup);
    passEncoder.drawIndexed(indexData.length);
    passEncoder.endPass();
    device!.queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(draw);
  });
}

window.addEventListener("load", main);
