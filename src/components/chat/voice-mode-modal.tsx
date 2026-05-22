import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onClose: (summary?: string) => void;
}

export function VoiceModeModal({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Modo de voz em breve</DialogTitle>
          <DialogDescription>
            Esta funcionalidade está sendo preparada e será lançada em breve
            para assinantes Ultra.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onClose()}>Ok, entendi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}