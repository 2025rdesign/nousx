import { createContext, useContext, useState, type ReactNode } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Check, Copy, Download, Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CanvasItem {
  code: string;
  language: string;
}

interface CanvasCtx {
  open: (item: CanvasItem) => void;
}

const Ctx = createContext<CanvasCtx | null>(null);

export function useCodeCanvas() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCodeCanvas must be used within CodeCanvasProvider");
  return c;
}

function extToLang(lang: string): string {
  const map: Record<string, string> = {
    javascript: "js",
    typescript: "ts",
    jsx: "jsx",
    tsx: "tsx",
    python: "py",
    bash: "sh",
    shell: "sh",
    html: "html",
    css: "css",
    json: "json",
    markdown: "md",
  };
  return map[lang.toLowerCase()] ?? "txt";
}

export function CodeCanvasProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<CanvasItem | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const open = (i: CanvasItem) => {
    setItem(i);
    setShowPreview(false);
  };
  const close = () => setItem(null);

  const onCopy = async () => {
    if (!item) return;
    await navigator.clipboard.writeText(item.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const onDownload = () => {
    if (!item) return;
    const blob = new Blob([item.code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `canvas.${extToLang(item.language)}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const previewable =
    item && ["html", "css", "javascript", "js"].includes(item.language.toLowerCase());

  const previewSrcDoc = () => {
    if (!item) return "";
    const lang = item.language.toLowerCase();
    if (lang === "html") return item.code;
    if (lang === "css") return `<style>${item.code}</style><div>Preview</div>`;
    return `<script>${item.code}<\/script>`;
  };

  return (
    <Ctx.Provider value={{ open }}>
      <div className="h-full flex">
        <div className="flex-1 min-w-0">{children}</div>
        {item && (
          <aside
            className="hidden md:flex flex-col w-[400px] border-l"
            style={{ background: "#13131A", borderColor: "#2A2A3A" }}
          >
            <div
              className="flex items-center justify-between px-3 py-2 border-b"
              style={{ borderColor: "#2A2A3A" }}
            >
              <span className="text-xs font-mono text-muted-foreground">
                {item.language || "code"}
              </span>
              <div className="flex items-center gap-1">
                {previewable && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowPreview((p) => !p)}
                  >
                    <Eye className="size-3.5" />
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={onCopy}>
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                </Button>
                <Button size="sm" variant="ghost" onClick={onDownload}>
                  <Download className="size-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={close}>
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              {showPreview && previewable ? (
                <iframe
                  title="preview"
                  sandbox="allow-scripts"
                  srcDoc={previewSrcDoc()}
                  className="w-full h-full bg-white"
                />
              ) : (
                <SyntaxHighlighter
                  language={item.language || "text"}
                  style={oneDark}
                  customStyle={{ margin: 0, background: "#13131A", fontSize: 12 }}
                  wrapLongLines
                >
                  {item.code}
                </SyntaxHighlighter>
              )}
            </div>
          </aside>
        )}
      </div>
    </Ctx.Provider>
  );
}