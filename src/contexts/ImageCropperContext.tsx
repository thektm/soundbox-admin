import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import ImageCropperModal from "../components/ImageCropperModal";
import type { ImageCropRequestOptions, ImageCropResult } from "../lib/imageCropper";

type PendingRequest = {
  file: File;
  options: ImageCropRequestOptions;
  resolve: (result: ImageCropResult | null) => void;
};

interface ImageCropperContextValue {
  cropImage: (file: File, options?: ImageCropRequestOptions) => Promise<ImageCropResult | null>;
  isCropping: boolean;
}

const ImageCropperContext = createContext<ImageCropperContextValue | null>(null);

export const ImageCropperProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [request, setRequest] = useState<PendingRequest | null>(null);
  const requestRef = useRef<PendingRequest | null>(null);

  const finish = useCallback((result: ImageCropResult | null) => {
    const current = requestRef.current;
    requestRef.current = null;
    setRequest(null);
    current?.resolve(result);
  }, []);

  useEffect(() => () => {
    requestRef.current?.resolve(null);
    requestRef.current = null;
  }, []);

  const cropImage = useCallback((file: File, options: ImageCropRequestOptions = {}) => {
    return new Promise<ImageCropResult | null>((resolve) => {
      // Only one editor can own pointer gestures at a time. A new selection safely cancels an older unresolved request.
      if (requestRef.current) requestRef.current.resolve(null);
      const next = { file, options, resolve };
      requestRef.current = next;
      setRequest(next);
    });
  }, []);

  return (
    <ImageCropperContext.Provider value={{ cropImage, isCropping: Boolean(request) }}>
      {children}
      {request && (
        <ImageCropperModal
          key={`${request.file.name}-${request.file.lastModified}-${request.file.size}`}
          file={request.file}
          options={request.options}
          onCancel={() => finish(null)}
          onComplete={finish}
        />
      )}
    </ImageCropperContext.Provider>
  );
};

export const useImageCropper = () => {
  const value = useContext(ImageCropperContext);
  if (!value) throw new Error("ImageCropperProvider در ساختار برنامه قرار نگرفته است.");
  return value;
};
