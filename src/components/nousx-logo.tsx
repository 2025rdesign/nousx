import { ThemeImage } from "./theme-image";

const DARK_LOGO =
  "https://central.daev.ca/wp-content/uploads/2026/05/FAVICON-AURA.png";
const LIGHT_LOGO =
  "https://central.daev.ca/wp-content/uploads/2026/05/FAVICON-AURA-SOMBRA.png";

export function NousxLogo({ className }: { className?: string }) {
  return (
    <ThemeImage
      darkSrc={DARK_LOGO}
      lightSrc={LIGHT_LOGO}
      alt="AuraIA"
      className={`h-9 w-auto select-none ${className ?? ""}`}
      draggable={false}
    />
  );
}
