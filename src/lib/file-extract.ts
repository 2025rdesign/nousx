import mammoth from "mammoth";

const PDF_WORKER_URL =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/build/pdf.worker.min.mjs";

async function extractPdf(file: File): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const parts: string[] = [];
  const maxPages = Math.min(doc.numPages, 50);
  for (let i = 1; i <= maxPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    parts.push(
      content.items
        .map((it: any) => ("str" in it ? it.str : ""))
        .join(" "),
    );
  }
  return parts.join("\n\n");
}

async function extractDocx(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const res = await mammoth.extractRawText({ arrayBuffer: buf });
  return res.value;
}

async function extractTxt(file: File): Promise<string> {
  return await file.text();
}

export interface ExtractedFile {
  name: string;
  size: number;
  kind: "pdf" | "docx" | "txt";
  text: string;
}

export async function extractFileText(file: File): Promise<ExtractedFile> {
  const name = file.name;
  const lower = name.toLowerCase();
  let kind: ExtractedFile["kind"];
  let text: string;
  if (lower.endsWith(".pdf") || file.type === "application/pdf") {
    kind = "pdf";
    text = await extractPdf(file);
  } else if (
    lower.endsWith(".docx") ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    kind = "docx";
    text = await extractDocx(file);
  } else if (lower.endsWith(".txt") || file.type.startsWith("text/")) {
    kind = "txt";
    text = await extractTxt(file);
  } else {
    throw new Error("Formato não suportado. Envie PDF, DOCX ou TXT.");
  }
  // Cap text to ~60k chars to keep payload sane
  const MAX = 60_000;
  if (text.length > MAX) text = text.slice(0, MAX) + "\n\n[...arquivo truncado]";
  return { name, size: file.size, kind, text: text.trim() };
}