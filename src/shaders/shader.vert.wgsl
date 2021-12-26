struct Uniforms {
    elapsedTime: f32;
    modelMatrix: mat4x4<f32>;
    viewProjectionMatrix: mat4x4<f32>;
};

struct VertexOutput {
    [[builtin(position)]] position: vec4<f32>;
    [[location(0)]] normal: vec4<f32>;
    [[location(1)]] uv: vec2<f32>;
};

[[group(0), binding(0)]] var<uniform> uniforms: Uniforms;


[[stage(vertex)]]
fn main(
    [[location(0)]] position: vec3<f32>,
    [[location(1)]] normal: vec3<f32>,
    [[location(2)]] uv: vec2<f32>,
) -> VertexOutput {
    var output: VertexOutput;
    var worldPosition: vec4<f32> = uniforms.modelMatrix * vec4<f32>(position, 1.0);
    worldPosition.y = sin(worldPosition.x + uniforms.elapsedTime);

    output.position = uniforms.viewProjectionMatrix * worldPosition;
    output.normal = vec4<f32>(normal, 1.0);
    output.uv = uv;
    return output;
}
