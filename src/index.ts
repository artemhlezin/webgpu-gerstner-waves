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

  // Create uniform buffer
  const uniformBuffer = device.createBuffer({
    size: (4 + 16 + 16) * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Create uniform bind group and bind group layout
  const uniformBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: "uniform" },
      },
    ],
  });
  const uniformBindGroup = device.createBindGroup({
    layout: uniformBindGroupLayout,
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
    bindGroupLayouts: [uniformBindGroupLayout, texturesBindGroupLayout],
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
    depthStencil: {
      format: "depth32float",
      depthWriteEnabled: true,
      depthCompare: "less",
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
  const textureView = texture.createView();

  // Create depth texture
  const depthTexture = device.createTexture({
    size: {
      width: canvas.width,
      height: canvas.height,
      depthOrArrayLayers: 1,
    },
    sampleCount: sampleCount,
    dimension: "2d",
    format: "depth32float",
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const controls = new Controls(canvas, 30, -40);
  controls.register();

  const startTime = Date.now();
  let elapsedTime = 0;

  requestAnimationFrame(function draw(timestamp: number) {
    // MVP
    const viewMatrix = createOrbitViewMatrix(
      10,
      quat.fromEuler(quat.create(), controls.y, controls.x, 0)
    );
    const projectionMatrix = mat4.perspectiveZO(
      mat4.create(),
      fov,
      aspectRatio,
      near,
      far
    );
    const viewProjectionMatrix = mat4.multiply(
      mat4.create(),
      projectionMatrix,
      viewMatrix
    );

    // Create render pass descriptor
    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view: textureView,
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
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthLoadValue: 1.0,
        depthStoreOp: "discard",
        stencilLoadValue: 0,
        stencilStoreOp: "store",
      },
    };

    // Update buffers
    device.queue.writeBuffer(
      uniformBuffer,
      0,
      new Float32Array([elapsedTime]).buffer
    );
    device.queue.writeBuffer(
      uniformBuffer,
      4 * Float32Array.BYTES_PER_ELEMENT, // 16bytes offset is used, despite elapsedTime is 4bytes.
      modelMatrix as Float32Array
    );

    device.queue.writeBuffer(
      uniformBuffer,
      (16 + 4) * Float32Array.BYTES_PER_ELEMENT,
      viewProjectionMatrix as Float32Array
    );

    const commandEncoder = device!.createCommandEncoder();

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(renderPipeline);
    passEncoder.setVertexBuffer(0, vertexBuffer);
    passEncoder.setIndexBuffer(indexBuffer, "uint32");
    passEncoder.setBindGroup(0, uniformBindGroup);
    passEncoder.setBindGroup(1, texturesBindGroup);
    passEncoder.drawIndexed(indexData.length);
    passEncoder.endPass();
    device!.queue.submit([commandEncoder.finish()]);

    elapsedTime = (Date.now() - startTime) / 1000;

    requestAnimationFrame(draw);
  });
}

window.addEventListener("load", main);
