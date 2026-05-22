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
        "w-full flex items-center gap-3 h-14 px-3 text-left transition-colors",
        "hover:bg-white/[0.024]",
        active
          ? "bg-[#6C47FF]/[0.08] border-l-2 border-[#6C47FF] pl-[10px]"
          : "border-l-2 border-transparent",
      )}
    >
      <div className="size-9 shrink-0 rounded-md bg-muted overflow-hidden">
        {profile.base_image_url ? (
          <img
            src={profile.base_image_url}
            alt={profile.name}
            className="w-full h-full object-cover"
          />
        ) : null}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium truncate leading-tight text-white">
          {profile.name}
        </div>
        {consistent && (
          <div className="flex items-center gap-1.5 mt-1">
            <span className="size-1.5 rounded-full bg-success" />
            <span className="text-[10px] text-success leading-none">Consistente</span>
          </div>
        )}
      </div>
    </button>
  );
}