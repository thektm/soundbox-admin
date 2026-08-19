export type CropAspectMode = "square" | "free";

export interface ImageCropRequestOptions {
  mode?: CropAspectMode;
  title?: string;
  description?: string;
  initialAspectRatio?: number;
  maxSourceBytes?: number;
  maxOutputBytes?: number;
  maxOutputDimension?: number;
  acceptedTypes?: string[];
  outputTypes?: string[];
}

export interface ImageCropResult {
  file: File;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
}

export const DEFAULT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const MIME_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const EXTENSION_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export const getCanonicalImageType = (file: File) => {
  const declared = String(file.type || "").toLowerCase();
  if (["image/jpeg", "image/jpg", "image/pjpeg"].includes(declared)) return "image/jpeg";
  if (declared === "image/png") return "image/png";
  if (declared === "image/webp") return "image/webp";
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  return EXTENSION_MIME[extension] || declared;
};

export const formatBytesFa = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "۰ بایت";
  const units = ["بایت", "کیلوبایت", "مگابایت", "گیگابایت"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toLocaleString("fa-IR", { maximumFractionDigits: index === 0 ? 0 : 1 })} ${units[index]}`;
};

export const getImageFileError = (file: File, options: ImageCropRequestOptions = {}) => {
  const acceptedTypes = options.acceptedTypes?.length ? options.acceptedTypes : DEFAULT_IMAGE_TYPES;
  const maxSourceBytes = options.maxSourceBytes ?? 40 * 1024 * 1024;

  if (!file.size) return "فایل تصویر خالی است. لطفاً تصویر دیگری انتخاب کنید.";
  const canonicalType = getCanonicalImageType(file);
  if (!acceptedTypes.includes(canonicalType)) {
    const allowedLabel = acceptedTypes.includes("image/webp") ? "JPG، PNG یا WEBP" : "JPG یا PNG";
    return `فرمت این تصویر پشتیبانی نمی‌شود. لطفاً فایل ${allowedLabel} انتخاب کنید.`;
  }
  if (file.size > maxSourceBytes) {
    return `حجم فایل اولیه بیش از حد مجاز است. حداکثر حجم قابل پردازش ${formatBytesFa(maxSourceBytes)} است.`;
  }
  return null;
};

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

const copyCanvasWithBackground = (source: HTMLCanvasElement, background = "#ffffff") => {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d");
  if (!context) return source;
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0);
  return canvas;
};

const resizeCanvas = (source: HTMLCanvasElement, scale: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return source;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
};

const getBaseName = (name: string) => {
  const withoutExtension = name.replace(/\.[^.]+$/, "").trim() || "image";
  return withoutExtension.replace(/[\\/:*?"<>|]+/g, "-");
};

const createFile = (blob: Blob, sourceName: string, type: string) => {
  const extension = MIME_EXTENSION[type] || "jpg";
  return new File([blob], `${getBaseName(sourceName)}-cropped.${extension}`, {
    type,
    lastModified: Date.now(),
  });
};

export const exportCroppedCanvas = async (
  canvas: HTMLCanvasElement,
  sourceFile: File,
  options: ImageCropRequestOptions = {},
): Promise<File> => {
  const maxBytes = options.maxOutputBytes ?? 9.5 * 1024 * 1024;
  const allowed = options.outputTypes?.length ? options.outputTypes : DEFAULT_IMAGE_TYPES;
  const sourceType = getCanonicalImageType(sourceFile);
  const preferred = allowed.includes(sourceType) ? sourceType : allowed[0] || "image/jpeg";

  const tryEncode = async (candidateCanvas: HTMLCanvasElement, type: string, quality?: number) => {
    const encodeCanvas = type === "image/jpeg" ? copyCanvasWithBackground(candidateCanvas) : candidateCanvas;
    const blob = await canvasToBlob(encodeCanvas, type, quality);
    if (!blob || blob.size <= 0) return null;
    if (blob.type && blob.type !== type) return null;
    return blob;
  };

  // Preserve the source format first when possible. PNG quality is lossless, so one pass is enough.
  if (preferred === "image/png") {
    const png = await tryEncode(canvas, "image/png");
    if (png && png.size <= maxBytes) return createFile(png, sourceFile.name, "image/png");
  } else {
    for (const quality of [0.95, 0.9, 0.84, 0.78, 0.72]) {
      const blob = await tryEncode(canvas, preferred, quality);
      if (blob && blob.size <= maxBytes) return createFile(blob, sourceFile.name, preferred);
    }
  }

  const fallbackTypes = ["image/webp", "image/jpeg"].filter(
    (type, index, values) => allowed.includes(type) && type !== preferred && values.indexOf(type) === index,
  );

  let working = canvas;
  for (let shrink = 0; shrink < 5; shrink += 1) {
    for (const type of fallbackTypes.length ? fallbackTypes : [preferred]) {
      const qualities = type === "image/png" ? [undefined] : [0.92, 0.84, 0.76, 0.68];
      for (const quality of qualities) {
        const blob = await tryEncode(working, type, quality);
        if (blob && blob.size <= maxBytes) return createFile(blob, sourceFile.name, type);
      }
    }
    working = resizeCanvas(working, 0.82);
  }

  // Last-resort encode. This should be extremely rare, but returning a smaller valid image is better than silently failing.
  const finalType = allowed.includes("image/jpeg") ? "image/jpeg" : allowed[0] || "image/jpeg";
  const finalCanvas = working.width > 1600 || working.height > 1600
    ? resizeCanvas(working, Math.min(1, 1600 / Math.max(working.width, working.height)))
    : working;
  const finalBlob = await tryEncode(finalCanvas, finalType, finalType === "image/png" ? undefined : 0.68);
  if (!finalBlob) throw new Error("ساخت فایل تصویر برش‌خورده انجام نشد. لطفاً تصویر دیگری انتخاب کنید.");
  if (finalBlob.size > maxBytes) throw new Error("حجم تصویر برش‌خورده هنوز بیش از حد مجاز است. لطفاً محدوده کوچک‌تری انتخاب کنید.");
  return createFile(finalBlob, sourceFile.name, finalType);
};
