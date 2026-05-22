import { cn } from "@/lib/utils";

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
}: {
  profile: Profile;
  active: boolean;
  onClick: () => void;
}) {
  const consistent = !!profile.base_media_id;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2.5 rounded-md px-2 h-12 text-left transition-colors",
        "hover:bg-white/[0.03]",
        active
          ? "bg-primary/15 border-l-2 border-primary pl-[6px]"
          : "border-l-2 border-transparent",
      )}
    >
      <div className="size-10 shrink-0 rounded-lg bg-muted overflow-hidden">
        {profile.base_image_url ? (
          <img
            src={profile.base_image_url}
            alt={profile.name}
            className="w-full h-full object-cover"
          />
        ) : null}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium truncate leading-tight">
          {profile.name}
        </div>
        {consistent && (
          <span className="inline-block mt-0.5 text-[9px] px-1.5 py-0 rounded-full bg-success/15 text-success leading-4">
            Consistente
          </span>
        )}
      </div>
    </button>
  );
}