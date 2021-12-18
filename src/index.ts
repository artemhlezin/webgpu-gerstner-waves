import { mat4, glMatrix, quat } from "gl-matrix";
import { loadImage, createOrbitViewMatrix } from "./utils";
import { Controls } from "./controls";
import { Plane } from "./geometries";

import vertexShaderSource from "./shaders/shader.vert.wgsl";
import fragmentShaderSource from "./shaders/shader.frag.wgsl";
import logoUrl from "./images/webgpu-logo.webp";
import "./styles/styles.css";

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

  // Generate geometry data
  const plane = new Plane(5, 5, 50, 50);
  const indexData = new Uint32Array(plane.indices);
  const vertexData = new Float32Array(plane.vertecies);

  // Create vertex/index buffers
  const vertexBuffer = device.createBuffer({
    size: vertexData.byteLength,
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
    arrayStride: plane.stride * Float32Array.BYTES_PER_ELEMENT,
    attributes: [
      {
        format: "float32x3",
        offset: plane.positionOffset * Float32Array.BYTES_PER_ELEMENT,
        shaderLocation: 0,
      },
      {
        format: "float32x3",
        offset: plane.normalOffset * Float32Array.BYTES_PER_ELEMENT,
        shaderLocation: 1,
      },
      {
        format: "float32x2",
        offset: plane.uvOffset * Float32Array.BYTES_PER_ELEMENT,
        shaderLocation: 2,
      },
    ],
  };

  // Camera data
  const near = 0.1;
  const far = 100.0;
  const fov = glMatrix.toRadian(50);
  const aspectRatio = canvas.width / canvas.height;

  // Model matrix
  const modelMatrix = mat4.create();
  mat4.rotateX(modelMatrix, modelMatrix, glMatrix.toRadian(-90));
  mat4.translate(modelMatrix, modelMatrix, [
    -plane.width / 2, // center plane
    -plane.height / 2,
    0,
  ]);
  // mat4.scale(modelMatrix, modelMatrix, [1, 1, 1]);

  // Create transformation buffer
  const uniformBuffer = device.createBuffer({
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
          buffer: uniformBuffer,
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

  const constrols = new Controls(canvas);
  constrols.register();

  requestAnimationFrame(function draw(timestamp: number) {
    // MVP
    const viewMatrix = createOrbitViewMatrix(
      10,
      quat.fromEuler(quat.create(), constrols.y, constrols.x, 0)
    );
    const projectionMatrix = mat4.perspectiveZO(
      mat4.create(),
      fov,
      aspectRatio,
      near,
      far
    );
    const modelViewMatrix = mat4.multiply(
      mat4.create(),
      viewMatrix,
      modelMatrix
    );
    const modelViewProjectionMatrix = mat4.multiply(
      mat4.create(),
      projectionMatrix,
      modelViewMatrix
    );

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

    // Update buffers
    device.queue.writeBuffer(
      uniformBuffer,
      0,
      modelViewProjectionMatrix as ArrayBuffer
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
