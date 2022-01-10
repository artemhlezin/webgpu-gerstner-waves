import { mat4, glMatrix, quat, vec2, vec3 } from "gl-matrix";
import {
  loadImage,
  createOrbitViewMatrix,
  positionFromViewMatrix,
} from "./utils";
import { Controls } from "./controls";
import { Plane } from "./geometries";

import shaderSource from "./shaders/gerstner-waves.wgsl";
import seaColorUrl from "./images/sea-color.webp";
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

  // Create shader module
  const shaderModule = device.createShaderModule({
    code: shaderSource,
  });

  // Generate geometry data
  const plane = new Plane(12, 12, 100, 100);
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
    size: (4 + 16 + 16 + 3) * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Create Gerstner Waves parameters buffer
  const wavesParametersBuffer = device.createBuffer({
    size: 32 * 5 + 4, // Wave parameters stride * number of waves + sum of amplitudes
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Create uniform bind group and bind group layout
  const uniformBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: "uniform" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
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
      {
        binding: 1,
        resource: {
          buffer: wavesParametersBuffer,
        },
      },
    ],
  });

  // Load sea color image and copy it to the GPUTexture
  const seaColor = await loadImage(seaColorUrl);
  const seaColorGPUTexture = device.createTexture({
    size: [seaColor.width, seaColor.height],
    format: presentationFormat,
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture(
    { source: seaColor },
    { texture: seaColorGPUTexture },
    [seaColor.width, seaColor.height]
  );

  // Create textures bind group and bind group layout
  const texturesBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: "non-filtering" },
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
          addressModeU: "clamp-to-edge",
          addressModeV: "clamp-to-edge",
        }),
      },
      {
        binding: 1,
        resource: seaColorGPUTexture.createView(),
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
      module: shaderModule,
      entryPoint: "vertex_main",
      buffers: [vertexBufferLayout],
    },
    fragment: {
      module: shaderModule,
      entryPoint: "fragment_main",
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

  const controls = new Controls(canvas, 50, -25);
  controls.register();

  const startTime = Date.now();
  let elapsedTime = 0;

  requestAnimationFrame(function draw(timestamp: number) {
    // MVP
    const viewMatrix = createOrbitViewMatrix(
      15,
      quat.fromEuler(quat.create(), controls.y, controls.x, 0)
    );

    // Not very optimal since matrix inversion was used twice.
    // First time for creating orbit view matrix and second to retrieve position.
    const viewPosition = positionFromViewMatrix(viewMatrix);

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
            r: 0.3,
            g: 0.3,
            b: 0.3,
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
      16, // 16 bytes offset is used, despite elapsedTime is 4 bytes.
      modelMatrix as Float32Array
    );

    device.queue.writeBuffer(
      uniformBuffer,
      16 + 16 * Float32Array.BYTES_PER_ELEMENT, // 16 bytes (elapsedTime) + 64 bytes (modelMatrix mat4x4<f32>)
      viewProjectionMatrix as Float32Array
    );

    device.queue.writeBuffer(
      uniformBuffer,
      16 + 16 * 2 * Float32Array.BYTES_PER_ELEMENT,
      viewPosition as Float32Array
    );

    const waves = [
      {
        waveLength: 8, // f32 - 4 bytes
        amplitude: 0.1, // f32 - 4 bytes
        steepness: 1.0, // f32 - 4 bytes, but 8 bytes will be reserved to match 32 bytes stride
        direction: vec2.normalize(vec2.create(), [1.0, 1.3]), // vec2<f32> - 8 bytes but 16 bytes will be reserved
      },
      {
        waveLength: 4,
        amplitude: 0.1,
        steepness: 0.8,
        direction: vec2.normalize(vec2.create(), [-0.7, 0.0]),
      },
      {
        waveLength: 5,
        amplitude: 0.2,
        steepness: 1.0,
        direction: vec2.normalize(vec2.create(), [0.3, 0.2]),
      },
      {
        waveLength: 10,
        amplitude: 0.5,
        steepness: 1.0,
        direction: vec2.normalize(vec2.create(), [4.3, 1.2]),
      },
      {
        waveLength: 3, // f32 - 4 bytes
        amplitude: 0.1, // f32 - 4 bytes
        steepness: 1.0, // f32 - 4 bytes, but 8 bytes will be reserved to match 32 bytes stride
        direction: vec2.normalize(vec2.create(), [0.5, 0.5]), // vec2<f32> - 8 bytes but 16 bytes will be reserved
      },
    ];

    // Uniform storage requires that array elements be aligned to 16 bytes.
    // 4 bytes waveLength + 4 bytes amplitude + 4+4 bytes steepness + 8+8 bytes direction = 32 Bytes
    const wavesStride = 32;
    const wavesParametersArray = new Float32Array(
      (waves.length * wavesStride) / Float32Array.BYTES_PER_ELEMENT // 24 elements
    );

    for (let i = 0; i < waves.length; i++) {
      wavesParametersArray[0 + i * 8] = waves[i].waveLength; // One element f32 is 4 bytes. 8 elements per stride
      wavesParametersArray[1 + i * 8] = waves[i].amplitude;
      wavesParametersArray[2 + i * 8] = waves[i].steepness;
      wavesParametersArray.set(waves[i].direction, 4 + i * 8); // Skip one element, since vec2<f32> aligment is 8 bytes
    }
    device.queue.writeBuffer(wavesParametersBuffer, 0, wavesParametersArray);
    const amplitudeSum = waves.reduce((acc, wave) => acc + wave.amplitude, 0);
    device.queue.writeBuffer(
      wavesParametersBuffer,
      wavesParametersArray.byteLength,
      new Float32Array([amplitudeSum]).buffer
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
