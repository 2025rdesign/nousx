/**
 * Baixa um asset (imagem/áudio) forçando o download via blob quando possível.
 * Em caso de falha (ex.: CORS), faz fallback abrindo a URL em nova aba.
 */
export async function downloadAsset(imageUrl: string, filename: string): Promise<void> {
  try {
    const response = await fetch(imageUrl, { mode: "cors" });
    if (!response.ok) throw new Error("fetch failed");
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch {
    window.open(imageUrl, "_blank");
  }
}