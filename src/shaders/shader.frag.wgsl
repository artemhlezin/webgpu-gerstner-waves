[[group(1), binding(0)]] var mySampler: sampler;
[[group(1), binding(1)]] var myTexture: texture_2d<f32>;

[[stage(fragment)]]
fn main(
    [[location(0)]] normal: vec4<f32>,
    [[location(1)]] uv: vec2<f32>,
    [[location(2)]] worldPosition: vec4<f32>,
) -> [[location(0)]] vec4<f32> {
    let light = normalize(vec3<f32>(0.8, 0.5, 0.5));
    let color = max(dot(normal.xyz, light), 0.0);
    let texture = (textureSample(myTexture, mySampler, uv) * 0.5 + 0.5);
    
    return vec4<f32>((worldPosition.yyy + 0.5 + color) * vec3<f32>(0.2, 0.8, 0.5), 1.0) * texture;
}