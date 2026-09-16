export async function compressImage(file, maxSide = 1200) {
  if (!(file instanceof Blob) || !file.size) throw Error("La foto está vacía. Volvé a elegirla.");
  if (file.size > 30 * 1024 * 1024) throw Error("La foto supera 30 MB.");
  if (file.type && !file.type.startsWith("image/")) throw Error("Elegí una imagen.");
  const url = URL.createObjectURL(file);
  let source;
  try {
    try {
      source = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });
    } catch {
      if (!globalThis.createImageBitmap) throw Error();
      source = await createImageBitmap(file);
    }
    const width = source.naturalWidth || source.width, height = source.naturalHeight || source.height;
    const scale = Math.min(1, maxSide / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error();
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error()), "image/jpeg", .8));
  } catch {
    throw Error("Este navegador no pudo abrir la foto (puede ser HEIC/HEIF). Usá ‘Cámara con guía’ para guardarla como JPG, o elegí una imagen JPG/PNG. No se guardó una foto vacía.");
  } finally { source?.close?.(); URL.revokeObjectURL(url); }
}
export function dataURL(blob) {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob); });
}
