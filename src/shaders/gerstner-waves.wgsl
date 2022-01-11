[[block]]  // Deprecated: [[block]] attributes have been removed from WGSL
struct Uniforms {
    elapsedTime: f32;
    [[align(16)]] modelMatrix: mat4x4<f32>;  // Explicitly set alignment
    viewProjectionMatrix: mat4x4<f32>;
    cameraPosition: vec3<f32>;
};

struct GerstnerWaveParameters {
    length: f32;  // 0 < L
    amplitude: f32; // 0 < A
    steepness: f32;  // Steepness of the peak of the wave. 0 <= S <= 1
    [[size(16), align(8)]] direction: vec2<f32>;  // Normalized direction of the wave
};

[[block]]  // Deprecated: [[block]] attributes have been removed from WGSL
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
[[group(0), binding(1)]] var<uniform> wavesUniforms: GerstnerWavesUniforms;

[[group(1), binding(0)]] var seaSampler: sampler;
[[group(1), binding(1)]] var seaColor: texture_2d<f32>;


let pi = 3.14159;   
let gravity = 9.8; // m/sec^2
let waveNumbers = 5;  

[[stage(vertex)]]
fn vertex_main(
    [[location(0)]] position: vec3<f32>,
    [[location(1)]] normal: vec3<f32>,
    [[location(2)]] uv: vec2<f32>,
) -> VertexOutput {
    var output: VertexOutput;
    var worldPosition: vec4<f32> = uniforms.modelMatrix * vec4<f32>(position, 1.0);

    var wavesSum: vec3<f32> = vec3<f32>(0.0);
    var wavesSumNormal: vec3<f32>;
    for(var i: i32 = 0; i < waveNumbers; i = i + 1) {
        let wave = wavesUniforms.waves[i];
        let wavevectorMagnitude = 2.0 * pi / wave.length;
        let wavevector = wave.direction * wavevectorMagnitude;
        let temporalFrequency = sqrt(gravity * wavevectorMagnitude);
        let steepnessFactor = wave.steepness / (wave.amplitude * wavevectorMagnitude * f32(waveNumbers)); 
        
        let pos = dot(wavevector, worldPosition.xz) - temporalFrequency * uniforms.elapsedTime;
        let sinPosAmplitudeDirection = sin(pos) * wave.amplitude * wave.direction;
        
        var offset: vec3<f32>;
        offset.x = sinPosAmplitudeDirection.x * steepnessFactor;
        offset.z = sinPosAmplitudeDirection.y * steepnessFactor;
        offset.y = cos(pos) * wave.amplitude;

        var normal: vec3<f32>;
        normal.x = sinPosAmplitudeDirection.x * wavevectorMagnitude;
        normal.z = sinPosAmplitudeDirection.y * wavevectorMagnitude;
        normal.y = cos(pos) * wave.amplitude * wavevectorMagnitude * steepnessFactor;

        wavesSum = wavesSum + offset;
        wavesSumNormal = wavesSumNormal + normal;
    }
    wavesSumNormal.y = 1.0 - wavesSumNormal.y;
    wavesSumNormal = normalize(wavesSumNormal);

    worldPosition.x = worldPosition.x - wavesSum.x;
    worldPosition.z = worldPosition.z - wavesSum.z;
    worldPosition.y = wavesSum.y;

    output.worldPosition = worldPosition;
    output.position = uniforms.viewProjectionMatrix * worldPosition;
    output.normal = vec4<f32>(wavesSumNormal, 0.0);
    output.uv = uv;
    return output;
}

[[stage(fragment)]]
fn fragment_main(
    data: VertexOutput,
) -> [[location(0)]] vec4<f32> {
    let lightColor = vec3<f32>(1.0, 0.8, 0.65);
    let skyColor = vec3<f32>(0.69, 0.84, 1.0);

    let lightPosition = vec3<f32>(-10.0, 1.0, -10.0);
    let light = normalize(lightPosition - data.worldPosition.xyz);  // Vector from surface to light
    let eye = normalize(uniforms.cameraPosition - data.worldPosition.xyz);  // Vector from surface to camera
    let reflection = reflect(data.normal.xyz, -eye);  // I - 2.0 * dot(N, I) * N
    
    let halfway = normalize(eye + light);  // Vector between View and Light
    let shininess = 30.0;
    let specular = clamp(pow(dot(data.normal.xyz, halfway), shininess), 0.0, 1.0) * lightColor;  // Blinn-Phong specular component

    let fresnel = clamp(pow(1.0 + dot(-eye, data.normal.xyz), 4.0), 0.0, 1.0);  // Cheap fresnel approximation

    // Normalize height to [0, 1]
    let normalizedHeight = (data.worldPosition.y + wavesUniforms.amplitudeSum) / (2.0 * wavesUniforms.amplitudeSum);
    let underwater = textureSample(seaColor, seaSampler, vec2<f32>(normalizedHeight, 0.0)).rgb;

    // Approximating Translucency (GPU Pro 2 article)
    let distortion = 0.1;
    let power = 4.0;
    let scale = 1.0;
    let ambient = 0.2;
    let thickness = smoothStep(0.0, 1.0, normalizedHeight);
    let distortedLight = light + data.normal.xyz * distortion;
    let translucencyDot = pow(clamp(dot(eye, -distortedLight), 0.0, 1.0), power);
    let translucency = (translucencyDot * scale + ambient) * thickness;
    let underwaterTranslucency = mix(underwater, lightColor, translucency) * translucency;

    let color = mix(underwater + underwaterTranslucency, skyColor, fresnel) + specular;

    return vec4<f32>(color, 1.0);
}