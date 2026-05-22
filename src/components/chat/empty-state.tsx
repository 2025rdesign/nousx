export function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
      <img
        src="https://central.daev.ca/wp-content/uploads/2026/05/AURA-IA-IMAGEM-DASH.png"
        alt="AuraIA"
        className="h-[180px] md:h-[220px] w-auto object-contain select-none"
        draggable={false}
      />
      <p className="mt-4 text-base md:text-lg text-muted-foreground">
        No que posso ajudar?
      </p>
    </div>
  );
}