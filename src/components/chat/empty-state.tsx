export function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
      <img
        src="https://central.daev.ca/wp-content/uploads/2026/05/AURA-IA-IMAGEM-DASH.png"
        alt="AuraIA"
        className="h-40 sm:h-56 md:h-72 lg:h-80 w-auto max-w-[85vw] object-contain select-none drop-shadow-[0_8px_40px_rgba(108,71,255,0.25)]"
        draggable={false}
      />
      <p className="mt-6 text-base md:text-lg lg:text-xl text-muted-foreground text-center">
        No que posso ajudar?
      </p>
    </div>
  );
}