"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type PreviewItem = {
  file: File;
  url: string;
  isVideo: boolean;
};

type TicketMediaDropzoneProps = {
  files: File[];
  onFilesChange: (files: File[]) => void;
  disabled?: boolean;
  label?: string;
  hint?: string;
};

export function TicketMediaDropzone({
  files,
  onFilesChange,
  disabled,
  label = "المرفقات (صور أو فيديو)",
  hint = "اسحب الملفات هنا أو انقر للاختيار — صور أو فيديوهات",
}: TicketMediaDropzoneProps) {
  const [dragOver, setDragOver] = useState(false);

  const previews: PreviewItem[] = useMemo(
    () =>
      files.map((file) => ({
        file,
        url: URL.createObjectURL(file),
        isVideo: file.type.startsWith("video/"),
      })),
    [files],
  );

  useEffect(() => {
    return () => {
      previews.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [previews]);

  const addFiles = (incoming: File[]) => {
    const allowed = incoming.filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    if (allowed.length === 0) return;
    onFilesChange([...files, ...allowed]);
  };

  const removeAt = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <p className="mb-1 text-xs font-medium text-slate-700">{label}</p>
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            document.getElementById("ticket-media-input")?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (disabled) return;
          addFiles(Array.from(e.dataTransfer.files ?? []));
        }}
        className={cn(
          "flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-white px-4 py-8 text-center transition-colors",
          dragOver ? "border-sky-500 bg-sky-50" : "border-slate-300 hover:border-slate-400",
          disabled && "pointer-events-none opacity-60",
        )}
        onClick={() => !disabled && document.getElementById("ticket-media-input")?.click()}
      >
        <input
          id="ticket-media-input"
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <p className="text-sm font-medium text-slate-800">{hint}</p>
        <p className="mt-2 text-xs text-slate-500">PNG، JPG، MP4، WEBM…</p>
      </div>

      {previews.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {previews.map((item, index) => (
            <li
              key={`${item.file.name}-${index}-${item.url}`}
              className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
            >
              <div className="relative aspect-video bg-slate-100">
                {item.isVideo ? (
                  <video src={item.url} className="h-full w-full object-contain" controls muted playsInline />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- معاينة blob محلية
                  <img src={item.url} alt="" className="h-full w-full object-cover" />
                )}
                <button
                  type="button"
                  className="absolute left-2 top-2 rounded-md bg-red-600 px-2 py-1 text-xs text-white shadow"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeAt(index);
                  }}
                >
                  حذف
                </button>
              </div>
              <p className="truncate px-2 py-1 text-center text-xs text-slate-600">{item.file.name}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
