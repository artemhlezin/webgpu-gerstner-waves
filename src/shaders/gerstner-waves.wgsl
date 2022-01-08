struct Uniforms {
    elapsedTime: f32;
    [[align(16)]] modelMatrix: mat4x4<f32>;  // Explicitly set align
    viewProjectionMatrix: mat4x4<f32>;
};

struct GerstnerWaveParameters {
    length: f32;  // Length of the wave
    amplitude: f32;
    steepness: f32;  // Steepness of the peak of the wave. Allowed range [0..1]
    [[size(16), align(8)]] direction: vec2<f32>;  // Normalized direction of the wave
};

struct GerstnerWavesUniforms {
    waves: [[stride(32)]] array<GerstnerWaveParameters, 3>;
};

struct VertexOutput {
    [[builtin(position)]] position: vec4<f32>;
    [[location(0)]] normal: vec4<f32>;
    [[location(1)]] uv: vec2<f32>;
    [[location(2)]] worldPosition: vec4<f32>;
};

[[group(0), binding(0)]] var<uniform> uniforms: Uniforms;
[[group(0), binding(1)]] var<uniform> waves_uniforms: GerstnerWavesUniforms;

[[group(1), binding(0)]] var mySampler: sampler;
[[group(1), binding(1)]] var myTexture: texture_2d<f32>;


let pi = 3.14159;   
let gravity = 9.8; // m/sec^2
let wave_numbers = 3;


[[stage(vertex)]]
fn vertex_main(
    [[location(0)]] position: vec3<f32>,
    [[location(1)]] normal: vec3<f32>,
    [[location(2)]] uv: vec2<f32>,
) -> VertexOutput {
    var output: VertexOutput;
    var worldPosition: vec4<f32> = uniforms.modelMatrix * vec4<f32>(position, 1.0);

    var waves_sum: vec3<f32> = vec3<f32>(0.0);
    var waves_sum_normal: vec3<f32>;
    for(var i: i32 = 0; i < wave_numbers; i = i + 1) {
        let wave = waves_uniforms.waves[i];
        let phase = 0.0;
        let wavevector_magnitude = 2.0 * pi / wave.length;
        let wavevector = wave.direction * wavevector_magnitude;
        let temporal_frequency = sqrt(gravity * wavevector_magnitude);  // Temporal frequency
        let steepness_factor = wave.steepness / (wave.amplitude * wavevector_magnitude * f32(wave_numbers)); 
        
        var offset: vec3<f32>;
        let pos = dot(wavevector, worldPosition.xz) - temporal_frequency * uniforms.elapsedTime + phase;
        offset.x = steepness_factor * wave.direction.x * wave.amplitude * sin(pos);
        offset.z = steepness_factor * wave.direction.y * wave.amplitude * sin(pos);
        offset.y = wave.amplitude * cos(pos);

        var normal: vec3<f32>;
        normal.x = sin(pos) * wave.amplitude * wavevector_magnitude * wave.direction.x;
        normal.z = sin(pos) * wave.amplitude * wavevector_magnitude * wave.direction.y;
        normal.y = cos(pos) * wave.amplitude * wavevector_magnitude * steepness_factor;

        waves_sum = waves_sum + offset;
        waves_sum_normal = waves_sum_normal + normal;
    }
    waves_sum_normal.y = 1.0 - waves_sum_normal.y;
    waves_sum_normal = normalize(waves_sum_normal);

    worldPosition.x = worldPosition.x - waves_sum.x;
    worldPosition.z = worldPosition.z - waves_sum.z;
    worldPosition.y = waves_sum.y;

    output.worldPosition = worldPosition;
    output.position = uniforms.viewProjectionMatrix * worldPosition;
    output.normal = vec4<f32>(waves_sum_normal, 0.0);
    output.uv = uv;
    return output;
}

[[stage(fragment)]]
fn fragment_main(
    data: VertexOutput,
) -> [[location(0)]] vec4<f32> {
    let light = normalize(vec3<f32>(0.8, 0.5, 0.5));
    let color = max(dot(data.normal.xyz, light), 0.0);
    let texture = (textureSample(myTexture, mySampler, data.uv) * 0.5 + 0.5);
    
    return vec4<f32>((data.worldPosition.yyy + 0.5 + color) * vec3<f32>(0.2, 0.8, 0.5), 1.0) * texture;
}