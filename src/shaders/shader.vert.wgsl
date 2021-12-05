struct VertexOutput {
    [[builtin(position)]] position: vec4<f32>;
    [[location(0)]] color: vec4<f32>;
};


[[stage(vertex)]]
fn main(
    [[location(0)]] position: vec3<f32>,
    [[location(1)]] color: vec3<f32>,
) -> VertexOutput {
    var output: VertexOutput;
    output.position = vec4<f32>(position.xyz, 1.0);
    output.color = vec4<f32>(color, 1.0);
    return output;
}
