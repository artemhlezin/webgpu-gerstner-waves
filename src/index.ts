import vertexShaderSource from "./shaders/shader.vert.wgsl";
import fragmentShaderSource from "./shaders/shader.frag.wgsl";

async function main(): Promise<void> {
  // Setup device
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) {
    throw "Could not retrieve a WebGPU adapter.";
  }
  const device = await adapter.requestDevice();

  // Setup swapchain
  const canvas: HTMLCanvasElement = document.querySelector("#gpuCanvas")!;
  const context = canvas.getContext("webgpu")!;
  const presentationFormat = context.getPreferredFormat(adapter);
  context.configure({
    device: device,
    format: presentationFormat,
  });

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
    // position       // color
    -0.5, -0.5, 0.0,  1.0, 0.0, 0.0,
     0.5, -0.5, 0.0,  0.0, 1.0, 0.0,
    -0.5,  0.5, 0.0,  0.0, 0.0, 1.0,
     0.5,  0.5, 0.0,  1.0, 1.0, 1.0,
  ]);
  const indexData = new Uint32Array([0, 1, 2, 1, 3, 2]);

  // Create quad geometry vertex/index buffers
  const vertexBuffer = device.createBuffer({
    size: 6 * 4 * Float32Array.BYTES_PER_ELEMENT,
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
    arrayStride: (3 + 3) * Float32Array.BYTES_PER_ELEMENT,
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
    ],
  };

  // Create render pipeline
  const renderPipelineDescriptor: GPURenderPipelineDescriptor = {
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
  };
  const renderPipeline = device.createRenderPipeline(renderPipelineDescriptor);

  requestAnimationFrame(function draw(timestamp: number) {
    // Create render pass descriptor
    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          loadValue: {
            r: Math.sin(timestamp * 0.001) * 0.5 + 0.5,
            g: 0.5,
            b: 1.0,
            a: 1.0,
          },
          storeOp: "store",
          view: context.getCurrentTexture().createView(),
        },
      ],
    };

    const commandEncoder = device!.createCommandEncoder();

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(renderPipeline);
    passEncoder.setVertexBuffer(0, vertexBuffer);
    passEncoder.setIndexBuffer(indexBuffer, "uint32");
    passEncoder.drawIndexed(indexData.length);
    passEncoder.endPass();
    device!.queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(draw);
  });
}

window.addEventListener("load", main);
