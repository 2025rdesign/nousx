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
  );
}