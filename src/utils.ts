export async function loadImage(url: string): Promise<ImageBitmap> {
  const response = await fetch(url);
  const blob = await response.blob();
  const image = await createImageBitmap(blob);

  return image;
}
