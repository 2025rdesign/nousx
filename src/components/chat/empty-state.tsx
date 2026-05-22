export function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
      <img
        src="https://central.daev.ca/wp-content/uploads/2026/05/AURA-IA-IMAGEM-DASH.png"
        alt="AuraIA"
        className="h-[160px] sm:h-[180px] md:h-[200px] w-auto max-w-[85vw] object-contain select-none"
        draggable={false}
      />
      <p className="mt-6 text-base md:text-lg lg:text-xl text-muted-foreground text-center">
        No que posso ajudar?
      </p>
    </div>
  );
}