import shaderSource from "./shaders/shader.wgsl";

if ("gpu" in navigator) {
  console.log("WebGPU is supported!");
  console.log(shaderSource);
}
