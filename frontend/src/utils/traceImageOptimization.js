const DISPLAY_MAX = 2400;
const THUMB_MAX = 360;
const DISPLAY_QUALITY = 0.82;
const THUMB_QUALITY = 0.76;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No se pudo leer la imagen.")); };
    img.src = url;
  });
}

function fit(width, height, max) {
  const ratio = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}

function canvasBlob(img, max, quality) {
  const { width, height } = fit(img.naturalWidth, img.naturalHeight, max);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d", { alpha: false }).drawImage(img, 0, 0, width, height);
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve({ blob, width, height }) : reject(new Error("No se pudo optimizar la imagen.")),
    "image/webp",
    quality
  ));
}

export async function optimizeTracePhoto(file) {
  if (!file?.type?.startsWith("image/")) return { display: file, thumbnail: null, optimized: false };
  if (file.type === "image/gif") return { display: file, thumbnail: null, optimized: false };
  const img = await loadImage(file);
  const [display, thumbnail] = await Promise.all([
    canvasBlob(img, DISPLAY_MAX, DISPLAY_QUALITY),
    canvasBlob(img, THUMB_MAX, THUMB_QUALITY),
  ]);
  const stem = (file.name || "evidence").replace(/\.[^.]+$/, "");
  return {
    optimized: true,
    originalBytes: file.size,
    display: new File([display.blob], `${stem}.webp`, { type: "image/webp" }),
    thumbnail: new File([thumbnail.blob], `${stem}.thumb.webp`, { type: "image/webp" }),
    displayMeta: { width: display.width, height: display.height, bytes: display.blob.size },
    thumbnailMeta: { width: thumbnail.width, height: thumbnail.height, bytes: thumbnail.blob.size },
  };
}
