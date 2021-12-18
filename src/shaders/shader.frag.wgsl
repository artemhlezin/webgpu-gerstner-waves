[[group(1), binding(0)]] var mySampler: sampler;
[[group(1), binding(1)]] var myTexture: texture_2d<f32>;

[[stage(fragment)]]
fn main([[location(0)]] normal: vec4<f32>, [[location(1)]] uv: vec2<f32>) -> [[location(0)]] vec4<f32> {
    // return vec4<f32>(uv, 0.0, 1.0);
    return textureSample(myTexture, mySampler, uv);
}