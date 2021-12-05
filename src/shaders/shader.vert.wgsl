[[block]]
struct Uniforms {
    transformMatrix: mat4x4<f32>;
};

struct VertexOutput {
    [[builtin(position)]] position: vec4<f32>;
    [[location(0)]] color: vec4<f32>;
};

[[group(0), binding(0)]] var<uniform> uniforms: Uniforms;


[[stage(vertex)]]
fn main(
    [[location(0)]] position: vec3<f32>,
    [[location(1)]] color: vec3<f32>,
) -> VertexOutput {
    var output: VertexOutput;
    output.position = uniforms.transformMatrix * vec4<f32>(position.xyz, 1.0);
    output.color = vec4<f32>(color, 1.0);
    return output;
}
