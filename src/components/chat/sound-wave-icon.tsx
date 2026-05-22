interface Props {
  active?: boolean;
  className?: string;
  color?: string;
}

export function SoundWaveIcon({ active, className, color = "currentColor" }: Props) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      className={className}
      aria-hidden="true"
    >
      {[
        { x: 3, base: 6, delay: "0s" },
        { x: 8.5, base: 10, delay: "0.2s" },
        { x: 14, base: 6, delay: "0.4s" },
      ].map((bar, i) => (
        <rect
          key={i}
          x={bar.x}
          width={3}
          rx={1.5}
          ry={1.5}
          fill={color}
          y={active ? undefined : (20 - bar.base) / 2}
          height={active ? undefined : bar.base}
          style={
            active
              ? {
                  transformOrigin: "center",
                  animation: `sound-wave-${i} 0.9s ease-in-out ${bar.delay} infinite`,
                }
              : undefined
          }
        />
      ))}
    </svg>
  );
}