"use client";

import { useState } from "react";
import { ImageOff, TriangleAlert } from "lucide-react";

type StorageMediaPreviewProps = {
  src: string;
  alt: string;
  type: "image" | "video";
  className: string;
};

export function StorageMediaPreview({ src, alt, type, className }: StorageMediaPreviewProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex h-36 w-full items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
        <div className="flex items-center gap-1 text-xs font-medium">
          {type === "video" ? <TriangleAlert className="h-4 w-4 text-amber-400" /> : <ImageOff className="h-4 w-4 text-amber-400" />}
          <span>الملف غير متاح</span>
        </div>
      </div>
    );
  }

  if (type === "video") {
    return (
      <video
        src={src}
        className={className}
        controls
        muted
        playsInline
        preload="none"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={800}
      height={288}
      loading="lazy"
      decoding="async"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

