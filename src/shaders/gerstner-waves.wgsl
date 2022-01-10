struct Uniforms {
    elapsedTime: f32;
    [[align(16)]] modelMatrix: mat4x4<f32>;  // Explicitly set align
    viewProjectionMatrix: mat4x4<f32>;
    cameraPosition: vec3<f32>;
};

struct GerstnerWaveParameters {
    length: f32;  // 0 < L
    amplitude: f32; // 0 < A
    steepness: f32;  // Steepness of the peak of the wave. 0 <= S <= 1
    [[size(16), align(8)]] direction: vec2<f32>;  // Normalized direction of the wave
};

struct GerstnerWavesUniforms {
    waves: [[stride(32)]] array<GerstnerWaveParameters, 5>;
    amplitudeSum: f32;  // Sum of waves amplitudes
};

struct VertexOutput {
    [[builtin(position)]] position: vec4<f32>;
    [[location(0)]] normal: vec4<f32>;
    [[location(1)]] uv: vec2<f32>;
    [[location(2)]] worldPosition: vec4<f32>;
};

[[group(0), binding(0)]] var<uniform> uniforms: Uniforms;
[[group(0), binding(1)]] var<uniform> waves_uniforms: GerstnerWavesUniforms;

[[group(1), binding(0)]] var seaSampler: sampler;
[[group(1), binding(1)]] var seaColor: texture_2d<f32>;


let pi = 3.14159;   
let gravity = 9.8; // m/sec^2
let wave_numbers = 5;  

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
    let light_pos = vec3<f32>(-10.0, 1.0, -10.0);
    let light = normalize(light_pos - data.worldPosition.xyz);  // Vector from surface to light
    let incidence = normalize(data.worldPosition.xyz - uniforms.cameraPosition);  // Vector from camera to the surface
    let reflection = reflect(data.normal.xyz, incidence);  // I - 2.0 * dot(N, I) * N
    
    let halfway = normalize(-incidence + light);  // Vector between View and Light
    let shininess = 30.0;
    let specular = clamp(pow(dot(data.normal.xyz, halfway), shininess), 0.0, 1.0);  // Blinn-Phong specular component

    let sky = vec3<f32>(0.69, 0.84, 1.0);

    // Normalize height to [0, 1]
    let normalized_height = (data.worldPosition.y + waves_uniforms.amplitudeSum) / (2.0 * waves_uniforms.amplitudeSum);
    let underwater = textureSample(seaColor, seaSampler, vec2<f32>(normalized_height, 0.0)).rgb;

    let fresnel = clamp(pow(1.0 + dot(incidence, data.normal.xyz), 4.0), 0.0, 1.0);  // Cheap fresnel approximation

    // Approximating Translucency (GPU Pro 2 article)
    let distortion = 0.1;
    let power = 4.0;
    let scale = 1.0;
    let ambient = 0.2;
    let light_color = vec3<f32>(1.0, 0.8, 0.65);
    let thickness = smoothStep(0.0, 1.0, normalized_height);
    let distorted_light = light + data.normal.xyz * distortion;
    let translucency_dot = pow(clamp(dot(-incidence, -distorted_light), 0.0, 1.0), power) * scale;
    let translucency = (translucency_dot + ambient) * thickness;

    let sss = mix(underwater, light_color, translucency) * translucency;
    let color = mix(underwater + sss, sky, fresnel) + specular * light_color;

    return vec4<f32>(color, 1.0);
}