import { useState } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Profile = {
  id: string;
  name: string;
  base_image_url: string | null;
  base_media_id: string | null;
};

export function CharacterCard({
  profile,
  active,
  onClick,
  onDelete,
}: {
  profile: Profile;
  active: boolean;
  onClick: () => void;
  onDelete?: () => void | Promise<void>;
}) {
  const consistent = !!profile.base_media_id;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  return (
    <div className="relative group">
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative w-full h-[100px] overflow-hidden rounded-[10px] text-left cursor-pointer transition-all",
        "bg-muted",
        active
          ? "ring-2 ring-[#6C47FF]"
          : "ring-1 ring-border hover:ring-[#6C47FF]/40",
      )}
    >
      {profile.base_image_url ? (
        <img
          src={profile.base_image_url}
          alt={profile.name}
          className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-muted to-muted/60" />
      )}
      {/* Bottom gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/75" />
      {/* Purple tint when active */}
      {active && (
        <div className="absolute inset-0 bg-[#6C47FF]/[0.15]" />
      )}
      {/* Text content */}
      <div className="absolute left-0 right-0 bottom-0 px-2.5 pb-2 pt-3 z-10">
        <div className="text-[13px] font-semibold leading-tight text-white drop-shadow-sm truncate">
          {profile.name}
        </div>
        {consistent && (
          <div className="flex items-center gap-1.5 mt-1">
            <span className="size-1.5 rounded-full bg-success" />
            <span className="text-[10px] leading-none text-white/70">Consistente</span>
          </div>
        )}
      </div>
    </button>
      {onDelete && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmOpen(true);
            }}
            aria-label="Excluir personagem"
            className="absolute top-1.5 right-1.5 z-20 size-7 rounded-full bg-black/60 backdrop-blur-sm text-white flex items-center justify-center transition-opacity opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-red-600"
          >
            <Trash2 className="size-3.5" />
          </button>
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir personagem?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação não pode ser desfeita. Todas as imagens geradas com este personagem serão mantidas na galeria.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  disabled={deleting}
                  onClick={async (e) => {
                    e.preventDefault();
                    setDeleting(true);
                    try {
                      await onDelete();
                      setConfirmOpen(false);
                    } finally {
                      setDeleting(false);
                    }
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {deleting ? "Excluindo..." : "Excluir"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}