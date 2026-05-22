interface ThemeImageProps {
  darkSrc: string;
  lightSrc: string;
  alt: string;
  className?: string;
  draggable?: boolean;
}

export function ThemeImage({
  darkSrc,
  lightSrc,
  alt,
  className,
  draggable = false,
}: ThemeImageProps) {
  return (
    <>
      <img
        src={darkSrc}
        alt={alt}
        className={`dark:block hidden ${className ?? ""}`}
        draggable={draggable}
      />
      <img
        src={lightSrc}
        alt={alt}
        className={`dark:hidden block ${className ?? ""}`}
        draggable={draggable}
      />
    </>
  );
}
