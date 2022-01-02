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

    // Gerstner Waves. Variable names correspond to:
    // https://www.researchgate.net/publication/264839743_Simulating_Ocean_Water

    let pi = 3.14159;   
    let g = 9.8; // gravity (m/sec^2) 
    let t = uniforms.elapsedTime; // time
    let phi = 0.0; // phase

    let lambda = 8.0;  // length of the wave
    let A = 1.0;   // amplitude
    let steepness = 0.8;
    let direction = normalize(vec2<f32>(0.0, 1.0));  // direction

    let k_magnitude = 2.0 * pi / lambda;
    let k = direction * k_magnitude;  // wavevector
    
    let w = sqrt(g * k_magnitude);  // temporal frequency
    let q = steepness / (A * k_magnitude);
    
    let x0 = worldPosition.xz;  // horizontal plane
    let x = x0 - q * direction * A * sin(dot(k, x0) - w * t + phi);
    let y = A * cos(dot(k, x0) - w * t + phi);

    worldPosition.x = x.x;
    worldPosition.z = x.y;
    worldPosition.y = y;

    output.position = uniforms.viewProjectionMatrix * worldPosition;
    output.normal = vec4<f32>(normal, 1.0);
    output.uv = uv;
    return output;
}
