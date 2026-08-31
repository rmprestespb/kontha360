import type { ParsedFile } from "@/lib/file-import/parsers";

export interface Transacao {
  data: Date;
  descricao: string;
  categoria: string;
  valor: number; // positivo = entrada, negativo = saída
  origem: string;
}

const STORAGE_KEY = "fluxo-caixa:importados";

export interface StoredFile {
  fileName: string;
  extension: string;
  rows: string[][];
}

export function salvarImportacao(files: ParsedFile[]) {
  if (typeof window === "undefined") return;
  const payload: StoredFile[] = files.map((f) => ({
    fileName: f.fileName,
    extension: f.extension,
    rows: f.rows,
  }));
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function lerImportacao(): StoredFile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredFile[]) : [];
  } catch {
    return [];
  }
}

export function limparImportacao() {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(STORAGE_KEY);
}

/* ---------- normalização ---------- */

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function parseNumero(raw: string): number | null {
  if (!raw) return null;
  let s = raw.replace(/[^\d,.\-()]/g, "").trim();
  if (!s) return null;
  const negativoParenteses = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, "");
  const temVirgula = s.includes(",");
  const temPonto = s.includes(".");
  if (temVirgula && temPonto) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".")
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (temVirgula) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negativoParenteses ? -Math.abs(n) : n;
}

function parseData(raw: string): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  const br = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (br) {
    const anoRaw = br[3] ?? "";
    const ano = Number(anoRaw.length === 2 ? `20${anoRaw}` : anoRaw);
    const d = new Date(ano, Number(br[2]) - 1, Number(br[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  return null;
}

function acharColuna(header: string[], termos: string[]): number {
  return header.findIndex((h) => {
    const n = normalize(h);
    return terms(termos).some((t) => n.includes(t));
  });
}
const terms = (t: string[]) => t.map(normalize);

/** Converte as linhas cruas de cada arquivo em transações financeiras. */
export function extrairTransacoes(files: StoredFile[]): Transacao[] {
  const out: Transacao[] = [];

  for (const file of files) {
    if (file.rows.length < 2) continue;
    const header = (file.rows[0] ?? []).map((c) => String(c ?? ""));
    const iData = acharColuna(header, ["data", "date", "vencimento", "emissao"]);
    const iDesc = acharColuna(header, [
      "descricao",
      "historico",
      "description",
      "lancamento",
      "item",
    ]);
    const iCat = acharColuna(header, ["categoria", "tipo", "classe", "category"]);
    const iValor = acharColuna(header, ["valor", "amount", "total", "preco", "montante"]);
    const iEntrada = acharColuna(header, ["entrada", "credito", "receita"]);
    const iSaida = acharColuna(header, ["saida", "debito", "despesa"]);

    for (const row of file.rows.slice(1)) {
      const data = iData >= 0 ? parseData(row[iData] ?? "") : null;

      let valor: number | null = null;
      if (iValor >= 0) valor = parseNumero(row[iValor] ?? "");
      if (valor === null && iEntrada >= 0) {
        const e = parseNumero(row[iEntrada] ?? "");
        if (e) valor = Math.abs(e);
      }
      if (valor === null && iSaida >= 0) {
        const s = parseNumero(row[iSaida] ?? "");
        if (s) valor = -Math.abs(s);
      }
      if (valor === null || valor === 0) continue;

      const catRaw = iCat >= 0 ? (row[iCat] ?? "") : "";
      const descRaw = iDesc >= 0 ? (row[iDesc] ?? "") : "";
      const tipoTexto = normalize(`${catRaw} ${descRaw}`);
      if (/saida|despesa|debito|pagamento|custo/.test(tipoTexto) && valor > 0) {
        valor = -valor;
      }

      out.push({
        data: data ?? new Date(),
        descricao: descRaw || "Sem descrição",
        categoria: catRaw || "Sem categoria",
        valor,
        origem: file.fileName,
      });
    }
  }

  return out.sort((a, b) => a.data.getTime() - b.data.getTime());
}

/* ---------- agregações ---------- */

export const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export interface Resumo {
  entradas: number;
  saidas: number;
  saldo: number;
  totalLancamentos: number;
  ticketMedio: number;
  variacaoMensal: number | null;
  porMes: { mes: string; entradas: number; saidas: number; saldo: number }[];
  porCategoria: { categoria: string; valor: number }[];
  topDespesas: { descricao: string; valor: number }[];
  acumulado: { mes: string; acumulado: number }[];
}

const MESES = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

export function resumir(transacoes: Transacao[]): Resumo {
  const entradas = transacoes.filter((t) => t.valor > 0).reduce((s, t) => s + t.valor, 0);
  const saidas = transacoes
    .filter((t) => t.valor < 0)
    .reduce((s, t) => s + Math.abs(t.valor), 0);

  const mapMes = new Map<string, { entradas: number; saidas: number }>();
  for (const t of transacoes) {
    const chave = `${t.data.getFullYear()}-${String(t.data.getMonth() + 1).padStart(2, "0")}`;
    const cur = mapMes.get(chave) ?? { entradas: 0, saidas: 0 };
    if (t.valor > 0) cur.entradas += t.valor;
    else cur.saidas += Math.abs(t.valor);
    mapMes.set(chave, cur);
  }

  const porMes = [...mapMes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([chave, v]) => {
      const [ano = "", mes = "1"] = chave.split("-");
      return {
        mes: `${MESES[Number(mes) - 1]}/${ano.slice(2)}`,
        entradas: Math.round(v.entradas * 100) / 100,
        saidas: Math.round(v.saidas * 100) / 100,
        saldo: Math.round((v.entradas - v.saidas) * 100) / 100,
      };
    });

  let acc = 0;
  const acumulado = porMes.map((m) => {
    acc += m.saldo;
    return { mes: m.mes, acumulado: Math.round(acc * 100) / 100 };
  });

  const mapCat = new Map<string, number>();
  for (const t of transacoes.filter((t) => t.valor < 0)) {
    mapCat.set(t.categoria, (mapCat.get(t.categoria) ?? 0) + Math.abs(t.valor));
  }
  const porCategoria = [...mapCat.entries()]
    .map(([categoria, valor]) => ({ categoria, valor: Math.round(valor * 100) / 100 }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 6);

  const topDespesas = transacoes
    .filter((t) => t.valor < 0)
    .sort((a, b) => a.valor - b.valor)
    .slice(0, 5)
    .map((t) => ({ descricao: t.descricao, valor: Math.abs(t.valor) }));

  const ultimo = porMes.at(-1);
  const penultimo = porMes.at(-2);
  const variacaoMensal =
    ultimo && penultimo && penultimo.saldo !== 0
      ? ((ultimo.saldo - penultimo.saldo) / Math.abs(penultimo.saldo)) * 100
      : null;

  return {
    entradas,
    saidas,
    saldo: entradas - saidas,
    totalLancamentos: transacoes.length,
    ticketMedio: transacoes.length ? (entradas + saidas) / transacoes.length : 0,
    variacaoMensal,
    porMes,
    porCategoria,
    topDespesas,
    acumulado,
  };
}

/* ---------- dados de demonstração ---------- */

export function transacoesDemo(): Transacao[] {
  const base = [
    { m: 0, e: 42000, s: 28000 },
    { m: 1, e: 38500, s: 31000 },
    { m: 2, e: 51000, s: 33500 },
    { m: 3, e: 47500, s: 29800 },
    { m: 4, e: 56000, s: 41000 },
    { m: 5, e: 61200, s: 38400 },
  ];
  const categorias = [
    "Folha de pagamento",
    "Fornecedores",
    "Impostos",
    "Marketing",
    "Infraestrutura",
  ];
  const ano = new Date().getFullYear();
  const out: Transacao[] = [];

  base.forEach(({ m, e, s }) => {
    out.push({
      data: new Date(ano, m, 5),
      descricao: "Recebimento de clientes",
      categoria: "Vendas",
      valor: e * 0.7,
      origem: "demo.csv",
    });
    out.push({
      data: new Date(ano, m, 20),
      descricao: "Serviços recorrentes",
      categoria: "Assinaturas",
      valor: e * 0.3,
      origem: "demo.csv",
    });
    categorias.forEach((cat, i) => {
      out.push({
        data: new Date(ano, m, 8 + i * 3),
        descricao: cat,
        categoria: cat,
        valor: -(s * ([0.4, 0.25, 0.15, 0.1, 0.1][i] ?? 0)),
        origem: "demo.csv",
      });
    });
  });

  return out.sort((a, b) => a.data.getTime() - b.data.getTime());
}
