import { vec3, mat4, quat } from "gl-matrix";

export async function loadImage(url: string): Promise<ImageBitmap> {
  const response = await fetch(url);
  const blob = await response.blob();
  const image = await createImageBitmap(blob);

  return image;
}

export function createOrbitViewMatrix(radius: number, rotation: quat): mat4 {
  // inv(R*T)
  const viewMatrix = mat4.create();
  mat4.fromQuat(viewMatrix, rotation);
  mat4.translate(viewMatrix, viewMatrix, vec3.fromValues(0, 0, radius));
  mat4.invert(viewMatrix, viewMatrix);

  return viewMatrix;
}
