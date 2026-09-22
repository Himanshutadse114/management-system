export const MENU_IMAGE_MAX_BYTES = 100 * 1024;

const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function canvasBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("This image could not be compressed.")),
      "image/jpeg",
      quality,
    );
  });
}

function loadHtmlImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Choose a valid JPEG, PNG or WebP image."));
    };
    image.src = url;
  });
}

async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch (_) {
      // Some Android WebViews expose createImageBitmap but cannot decode every
      // supported file. The HTML image decoder is a reliable fallback.
    }
  }
  return loadHtmlImage(file);
}

function safeFileName(name) {
  const stem = String(name || "menu-photo")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${stem || "menu-photo"}.jpg`;
}

export async function compressMenuImage(
  file,
  { maxBytes = MENU_IMAGE_MAX_BYTES, maxDimension = 1600 } = {},
) {
  if (!(file instanceof Blob)) throw new Error("Choose an image first.");
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Choose a JPEG, PNG or WebP image.");
  }

  const decoded = await decodeImage(file);
  if (!decoded.width || !decoded.height) {
    decoded.close?.();
    throw new Error("The selected image has invalid dimensions.");
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    decoded.close?.();
    throw new Error("Image compression is unavailable on this device.");
  }

  let scale = Math.min(1, maxDimension / Math.max(decoded.width, decoded.height));
  let quality = 0.86;
  let result = null;

  try {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const width = Math.max(96, Math.round(decoded.width * scale));
      const height = Math.max(96, Math.round(decoded.height * scale));
      canvas.width = width;
      canvas.height = height;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(decoded.source, 0, 0, width, height);
      result = await canvasBlob(canvas, quality);
      if (result.size <= maxBytes) break;

      if (quality > 0.46) quality = Math.max(0.42, quality - 0.1);
      else {
        scale *= 0.82;
        quality = 0.72;
      }
    }
  } finally {
    decoded.close?.();
  }

  if (!result || result.size > maxBytes) {
    throw new Error("This image could not be reduced below 100 KB. Try another photo.");
  }

  return new File([result], safeFileName(file.name), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

export function formatImageSize(bytes) {
  if (!Number.isFinite(Number(bytes))) return "0 KB";
  return `${Math.max(1, Math.ceil(Number(bytes) / 1024))} KB`;
}
