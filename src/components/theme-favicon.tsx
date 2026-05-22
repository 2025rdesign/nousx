import { useEffect } from "react";
import { useTheme } from "./theme-provider";

const DARK_FAVICON =
  "https://central.daev.ca/wp-content/uploads/2026/05/FAVICON-AURA.png";
const LIGHT_FAVICON =
  "https://central.daev.ca/wp-content/uploads/2026/05/FAVICON-AURA-SOMBRA.png";

export function FaviconTheme() {
  const { theme } = useTheme();

  useEffect(() => {
    const link =
      document.querySelector('link[rel="icon"]') ||
      document.querySelector('link[rel="shortcut icon"]');
    if (link && link instanceof HTMLLinkElement) {
      link.href = theme === "dark" ? DARK_FAVICON : LIGHT_FAVICON;
    }
  }, [theme]);

  return null;
}
