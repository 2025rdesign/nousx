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
        "w-full flex items-center gap-3 rounded-md p-2 text-left transition-colors",
        "hover:bg-secondary/60",
        active && "bg-secondary border-l-2 border-primary pl-[6px]",
      )}
    >
      <div className="size-14 shrink-0 rounded-md bg-muted overflow-hidden">
        {profile.base_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.base_image_url}
            alt={profile.name}
            className="w-full h-full object-cover"
          />
        ) : null}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{profile.name}</div>
        <span
          className={cn(
            "inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded-full",
            consistent
              ? "bg-success/15 text-success"
              : "bg-muted text-muted-foreground",
          )}
        >
          {consistent ? "Consistente" : "Sem rosto fixo"}
        </span>
      </div>
    </button>
  );
}