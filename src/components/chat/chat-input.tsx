import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { FileText, Globe, Paperclip, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { extractFileText, type ExtractedFile } from "@/lib/file-extract";

interface Props {
  onSend: (
    text: string,
    image: string | null,
    file: ExtractedFile | null,
    reasoning: boolean,
    webSearch: boolean,
  ) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: Props) {
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [file, setFile] = useState<ExtractedFile | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [reasoning, setReasoning] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleSubmit() {
    const t = text.trim();
    if (!t || disabled || extracting) return;
    onSend(t, image, file, reasoning, webSearch);
    setText("");
    setImage(null);
    setFile(null);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  async function onAttach(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const lower = f.name.toLowerCase();
    const isImage = /^image\/(jpeg|jpg|png|webp)$/.test(f.type) || /\.(jpe?g|png|webp)$/.test(lower);
    const isDoc = /\.(pdf|docx|txt)$/.test(lower);
    if (!isImage && !isDoc) {
      notify.error("Envie imagem, PDF, DOCX ou TXT.");
      return;
    }
    if (isImage) {
      if (f.size > 4 * 1024 * 1024) {
        notify.error("Imagem muito grande (máx 4MB).");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => setImage(reader.result as string);
      reader.readAsDataURL(f);
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      notify.error("Arquivo muito grande (máx 10MB).");
      return;
    }
    setExtracting(true);
    try {
      const extracted = await extractFileText(f);
      if (!extracted.text) {
        notify.error("Não consegui ler o conteúdo do arquivo.");
        return;
      }
      setFile(extracted);
    } catch (err) {
      console.error(err);
      notify.error(err instanceof Error ? err.message : "Falha ao ler o arquivo.");
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div className="w-full max-w-3xl mx-auto px-3 md:px-4 pb-4 pt-2">
      <div className="rounded-2xl border border-border bg-card shadow-sm focus-within:border-accent transition-colors">
        {(image || file || extracting) && (
          <div className="px-3 pt-3 flex items-center gap-2 flex-wrap">
            {image && (
            <div className="relative">
              <img src={image} alt="" className="size-16 rounded-lg object-cover" />
              <button
                type="button"
                onClick={() => setImage(null)}
                className="absolute -top-2 -right-2 bg-background border border-border rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                aria-label="Remover imagem"
              >
                <X className="size-3.5" />
              </button>
            </div>
            )}
            {file && (
              <div className="relative flex items-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 max-w-[260px]">
                <FileText className="size-4 shrink-0 text-accent" />
                <span className="text-xs truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="ml-1 text-muted-foreground hover:text-foreground"
                  aria-label="Remover arquivo"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )}
            {extracting && (
              <div className="text-xs text-muted-foreground animate-pulse">
                Lendo arquivo...
              </div>
            )}
          </div>
        )}
        <TextareaAutosize
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder="Pergunte qualquer coisa..."
          minRows={1}
          maxRows={6}
          className="w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm text-foreground placeholder:text-muted-foreground outline-none"
        />
        <div className="flex items-center gap-1 px-2 pb-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            className="hidden"
            onChange={onAttach}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileRef.current?.click()}
            aria-label="Anexar arquivo"
          >
            <Paperclip className="size-4" />
          </Button>
          <Toggle
            pressed={reasoning}
            onPressedChange={setReasoning}
            size="sm"
            aria-label="Modo raciocínio"
            className="gap-1 text-xs data-[state=on]:bg-accent/15 data-[state=on]:text-accent"
          >
            <Sparkles className="size-3.5" />
            Raciocínio
          </Toggle>
          <Toggle
            pressed={webSearch}
            onPressedChange={setWebSearch}
            size="sm"
            aria-label="Busca web"
            className="gap-1 text-xs data-[state=on]:bg-accent/15 data-[state=on]:text-accent"
          >
            <Globe className="size-3.5" />
            Busca web
          </Toggle>
          <div className="flex-1" />
          <Button
            type="button"
            size="icon"
            onClick={handleSubmit}
            disabled={!text.trim() || disabled}
            className={cn("rounded-lg")}
            aria-label="Enviar"
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground text-center mt-2">
        Pode cometer erros. Verifique informações importantes.
      </p>
    </div>
  );
}