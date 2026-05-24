import { useEffect } from "react";
import { Download, X } from "lucide-react";
import { downloadAsset } from "@/lib/download";
import { cn } from "@/lib/utils";

interface ImageLightboxProps {
  src: string;
  alt?: string;
  open: boolean;
  onClose: () => void;
}

export function ImageLightbox({ src, alt, open, onClose }: ImageLightboxProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center",
        "bg-black/90 backdrop-blur-sm animate-in fade-in duration-200",
      )}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Fechar"
        className="absolute top-4 right-4 inline-flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
      >
        <X className="size-5" />
      </button>

      <img
        src={src}
        alt={alt || "Imagem"}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
      />

      <div
        className="absolute bottom-6 left-1/2 -translate-x-1/2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => downloadAsset(src, `aura-${Date.now()}.jpg`)}
          className="inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-2.5 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-white/20"
        >
          <Download className="size-4" />
          Baixar
        </button>
      </div>
    </div>
  );
}