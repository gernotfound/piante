export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
export const MAX_STORED_PHOTO_BYTES = 120 * 1024;
export const MAX_IMAGE_SIDE = 1080;

// A compact image stored in Firestore. Intended only for a personal garden,
// not for high-resolution originals or a photo-sharing service.
export function checkPhotoInput(file) {
  if (!file || !["image/jpeg","image/png","image/webp","image/avif"].includes(file.type)) {
    throw new Error("Scegli un'immagine JPEG, PNG, WebP o AVIF.");
  }
  if (!Number.isFinite(file.size) || file.size < 1 || file.size > MAX_UPLOAD_BYTES) {
    throw new Error("La fotografia deve essere più piccola di 30 MB.");
  }
}

export async function compressPhoto(file, {
  decode = source => createImageBitmap(source),
  makeCanvas = () => document.createElement("canvas")
} = {}) {
  checkPhotoInput(file);
  const source = await decode(file);
  try {
    if (!Number.isFinite(source.width) || !Number.isFinite(source.height) ||
        source.width < 1 || source.height < 1 ||
        source.width * source.height > 45_000_000) {
      throw new Error("Dimensioni della fotografia non supportate.");
    }
    const canvas = makeCanvas();
    const ctx = canvas.getContext("2d");
    if (!ctx || typeof canvas.toBlob !== "function") {
      throw new Error("Il browser non supporta l'ottimizzazione delle fotografie.");
    }
    let scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(source.width, source.height));
    for (let i = 0; i < 8; i++) {
      canvas.width = Math.max(1, Math.round(source.width * scale));
      canvas.height = Math.max(1, Math.round(source.height * scale));
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      const quality = Math.max(0.4, 0.82 - 0.055 * i);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", quality));
      if (!blob || blob.type !== "image/webp") {
        throw new Error("La conversione WebP non è disponibile su questo browser.");
      }
      if (blob.size <= MAX_STORED_PHOTO_BYTES && blob.size > 0) {
        return {bytes:new Uint8Array(await blob.arrayBuffer()), width:canvas.width,
          height:canvas.height, size:blob.size};
      }
      scale *= 0.81;
    }
    throw new Error("Foto troppo complessa per il limite gratuito. Prova un'immagine meno dettagliata.");
  } finally {
    source.close?.();
  }
}
