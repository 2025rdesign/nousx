import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { Paperclip, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  onSend: (text: string, image: string | null, reasoning: boolean) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: Props) {
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [reasoning, setReasoning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleSubmit() {
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t, image, reasoning);
    setText("");
    setImage(null);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!/image\/(jpeg|jpg|png)/.test(f.type)) {
      toast.error("Envie uma imagem JPG ou PNG.");
      return;
    }
    if (f.size > 4 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx 4MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(f);
  }

  return (
    <div className="w-full max-w-3xl mx-auto px-3 md:px-4 pb-4 pt-2">
      <div className="rounded-2xl border border-border bg-card shadow-sm focus-within:border-accent transition-colors">
        {image && (
          <div className="px-3 pt-3 flex items-center gap-2">
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
            accept="image/jpeg,image/png"
            className="hidden"
            onChange={onFile}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileRef.current?.click()}
            aria-label="Anexar imagem"
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