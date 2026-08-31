/**
 * Leitores de arquivo (100% no navegador).
 * Cada leitor devolve texto puro e, quando possível, linhas tabulares.
 */

export type SupportedExt =
  | "csv"
  | "xml"
  | "md"
  | "txt"
  | "docx"
  | "doc"
  | "odt"
  | "rtf"
  | "pdf";

export const SUPPORTED_EXTENSIONS: SupportedExt[] = [
  "csv",
  "xml",
  "md",
  "txt",
  "docx",
  "doc",
  "odt",
  "rtf",
  "pdf",
];

export const ACCEPT_ATTR =
  ".csv,.xml,.md,.txt,.docx,.doc,.odt,.rtf,.pdf";

export interface ParsedFile {
  fileName: string;
  extension: SupportedExt;
  sizeBytes: number;
  /** Texto extraído do documento */
  text: string;
  /** Linhas tabulares detectadas (cabeçalho incluído na posição 0 quando existir) */
  rows: string[][];
  warnings: string[];
}

export function getExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

export function isSupported(fileName: string): boolean {
  return (SUPPORTED_EXTENSIONS as string[]).includes(getExtension(fileName));
}

function stripXmlTags(xml: string): string {
  return xml
    .replace(/<\?xml[\s\S]*?\?>/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** Divide texto livre em linhas/colunas usando separadores comuns. */
export function textToRows(text: string): string[][] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  return lines.map((line) => {
    if (line.includes("|")) {
      return line
        .split("|")
        .map((c) => c.trim())
        .filter((c, i, arr) => !(c === "" && (i === 0 || i === arr.length - 1)));
    }
    if (line.includes(";")) return line.split(";").map((c) => c.trim());
    if (line.includes("\t")) return line.split("\t").map((c) => c.trim());
    return [line];
  });
}

async function parseCsv(file: File): Promise<{ rows: string[][]; text: string }> {
  const Papa = (await import("papaparse")).default;
  const text = await file.text();
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
    delimiter: "",
  });
  return { rows: (result.data as string[][]) ?? [], text };
}

async function parseDocx(file: File): Promise<{ text: string }> {
  const mammoth = await import("mammoth/mammoth.browser.js");
  const arrayBuffer = await file.arrayBuffer();
  const result = await (mammoth as any).extractRawText({ arrayBuffer });
  return { text: result.value as string };
}

async function parseOdt(file: File): Promise<{ text: string }> {
  const { unzipSync, strFromU8 } = await import("fflate");
  const buf = new Uint8Array(await file.arrayBuffer());
  const files = unzipSync(buf);
  const content = files["content.xml"];
  if (!content) throw new Error("content.xml não encontrado no arquivo ODT.");
  const xml = strFromU8(content)
    .replace(/<text:p[^>]*>/g, "\n")
    .replace(/<table:table-row[^>]*>/g, "\n")
    .replace(/<table:table-cell[^>]*>/g, " | ");
  return { text: stripXmlTags(xml) };
}

function rtfToText(rtf: string): string {
  return rtf
    .replace(/\\'([0-9a-f]{2})/gi, (_m, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\line/g, "\n")
    .replace(/\{\\\*[\s\S]*?\}/g, " ")
    .replace(/\\[a-z]+-?\d* ?/gi, "")
    .replace(/[{}]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** .doc binário (Word 97-2003): extração heurística de texto legível. */
function legacyDocToText(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 13 || b === 10) out += "\n";
    else if (b === 9) out += "\t";
    else if (b >= 32 && b <= 126) out += String.fromCharCode(b);
    else if (b >= 160 && b <= 255) out += String.fromCharCode(b);
    else out += "\u0000";
  }
  return out
    .split("\u0000")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 3 && /[a-zA-ZÀ-ÿ0-9]/.test(chunk))
    .join("\n");
}

async function parsePdf(file: File): Promise<{ text: string }> {
  const pdfjs: any = await import("pdfjs-dist");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url"))
    .default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    let line = "";
    const lines: string[] = [];
    for (const item of content.items as any[]) {
      const y = item.transform?.[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        lines.push(line.trim());
        line = "";
      }
      line += item.str + " ";
      lastY = y;
    }
    if (line.trim()) lines.push(line.trim());
    pages.push(lines.filter(Boolean).join("\n"));
  }
  return { text: pages.join("\n") };
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const extension = getExtension(file.name) as SupportedExt;
  const warnings: string[] = [];

  if (!SUPPORTED_EXTENSIONS.includes(extension)) {
    throw new Error(`Formato .${extension || "?"} não suportado.`);
  }

  let text = "";
  let rows: string[][] = [];

  switch (extension) {
    case "csv": {
      const r = await parseCsv(file);
      rows = r.rows;
      text = r.text;
      break;
    }
    case "xml": {
      const raw = await file.text();
      text = stripXmlTags(raw);
      rows = xmlToRows(raw);
      if (!rows.length) rows = textToRows(text);
      break;
    }
    case "md":
    case "txt": {
      text = await file.text();
      rows = textToRows(
        text.replace(/^\s*\|?\s*:?-{2,}.*$/gm, ""), // remove separadores de tabela markdown
      );
      break;
    }
    case "docx": {
      text = (await parseDocx(file)).text;
      rows = textToRows(text);
      break;
    }
    case "odt": {
      text = (await parseOdt(file)).text;
      rows = textToRows(text);
      break;
    }
    case "rtf": {
      text = rtfToText(await file.text());
      rows = textToRows(text);
      break;
    }
    case "doc": {
      text = legacyDocToText(await file.arrayBuffer());
      rows = textToRows(text);
      warnings.push(
        "Arquivos .doc (Word 97-2003) usam extração aproximada. Prefira .docx quando possível.",
      );
      break;
    }
    case "pdf": {
      text = (await parsePdf(file)).text;
      rows = textToRows(text);
      if (!text.trim())
        warnings.push("Nenhum texto encontrado — o PDF pode ser digitalizado (imagem).");
      break;
    }
  }

  rows = rows.filter((r) => r.some((c) => c && c.trim() !== ""));

  return {
    fileName: file.name,
    extension,
    sizeBytes: file.size,
    text: text.trim(),
    rows,
    warnings,
  };
}

/** Converte um XML com registros repetidos (ex.: <lancamento>) em linhas. */
function xmlToRows(raw: string): string[][] {
  try {
    const doc = new DOMParser().parseFromString(raw, "application/xml");
    if (doc.querySelector("parsererror")) return [];
    const root = doc.documentElement;
    const children = Array.from(root.children);
    if (children.length < 1) return [];

    const records = children.filter((c) => c.children.length > 0);
    if (!records.length) return [];

    const headers: string[] = [];
    for (const rec of records) {
      for (const field of Array.from(rec.children)) {
        if (!headers.includes(field.tagName)) headers.push(field.tagName);
      }
    }

    const rows: string[][] = [headers];
    for (const rec of records) {
      rows.push(
        headers.map(
          (h) => rec.getElementsByTagName(h)[0]?.textContent?.trim() ?? "",
        ),
      );
    }
    return rows;
  } catch {
    return [];
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
