import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  brl,
  extrairTransacoes,
  lerImportacao,
  resumir,
  transacoesDemo,
  type Transacao,
} from "@/lib/reports/analytics";

export const Route = createFileRoute("/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios de Fluxo de Caixa | Painel Visual" },
      {
        name: "description",
        content:
          "Painel visual estilo Power BI com entradas, saídas, saldo acumulado e despesas por categoria, com explicação simples de cada gráfico.",
      },
      { property: "og:title", content: "Relatórios de Fluxo de Caixa" },
      {
        property: "og:description",
        content:
          "Gráficos interativos de entradas, saídas e saldo com leitura fácil para tomada de decisão.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Relatorios,
});

const CORES = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--muted-foreground)",
];

function Relatorios() {
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [usandoDemo, setUsandoDemo] = useState(true);

  useEffect(() => {
    const importados = extrairTransacoes(lerImportacao());
    if (importados.length > 0) {
      setTransacoes(importados);
      setUsandoDemo(false);
    } else {
      setTransacoes(transacoesDemo());
      setUsandoDemo(true);
    }
  }, []);

  const r = useMemo(() => resumir(transacoes), [transacoes]);

  const mesTop = [...r.porMes].sort((a, b) => b.saldo - a.saldo)[0];
  const maiorCategoria = r.porCategoria[0];
  const margem = r.entradas > 0 ? (r.saldo / r.entradas) * 100 : 0;

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10 md:py-14">
      <header className="mb-8">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Link
            to="/"
            className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Voltar para importação
          </Link>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              usandoDemo
                ? "bg-accent/20 text-accent"
                : "bg-primary/20 text-primary"
            }`}
          >
            {usandoDemo ? "Dados de demonstração" : "Dados dos arquivos importados"}
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
          <span className="text-gradient-brand">Relatórios do fluxo de caixa</span>
        </h1>
        <p className="mt-3 max-w-2xl text-base text-muted-foreground">
          Cada bloco abaixo responde a uma pergunta simples sobre o dinheiro do
          negócio. Passe o mouse nos gráficos para ver os valores exatos.
        </p>
      </header>

      {/* Resumo em cartões */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          titulo="Entradas"
          valor={brl(r.entradas)}
          explicacao="Tudo que entrou no caixa no período."
          tom="primary"
        />
        <Kpi
          titulo="Saídas"
          valor={brl(r.saidas)}
          explicacao="Tudo que saiu: contas, compras e custos."
          tom="destructive"
        />
        <Kpi
          titulo="Saldo do período"
          valor={brl(r.saldo)}
          explicacao={
            r.saldo >= 0
              ? "Sobrou dinheiro: entradas maiores que saídas."
              : "Faltou dinheiro: as saídas superaram as entradas."
          }
          tom={r.saldo >= 0 ? "primary" : "destructive"}
        />
        <Kpi
          titulo="Margem de caixa"
          valor={`${margem.toFixed(1)}%`}
          explicacao="De cada R$ 100 que entram, quanto sobra no caixa."
          tom="accent"
        />
      </section>

      {/* Leitura rápida */}
      <section className="panel mt-6 p-5">
        <h2 className="text-sm font-semibold">Leitura rápida do período</h2>
        <ul className="mt-3 grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
          <li>
            • Foram analisados <strong className="text-foreground">{r.totalLancamentos}</strong>{" "}
            lançamentos, com valor médio de{" "}
            <strong className="text-foreground">{brl(r.ticketMedio)}</strong>.
          </li>
          <li>
            • Melhor mês:{" "}
            <strong className="text-foreground">{mesTop?.mes ?? "—"}</strong>
            {mesTop ? ` (saldo de ${brl(mesTop.saldo)})` : ""}.
          </li>
          <li>
            • Maior despesa por categoria:{" "}
            <strong className="text-foreground">
              {maiorCategoria?.categoria ?? "—"}
            </strong>
            {maiorCategoria ? ` com ${brl(maiorCategoria.valor)}` : ""}.
          </li>
          <li>
            • Comparado ao mês anterior, o saldo{" "}
            <strong className="text-foreground">
              {r.variacaoMensal === null
                ? "não pôde ser comparado"
                : `${r.variacaoMensal >= 0 ? "subiu" : "caiu"} ${Math.abs(r.variacaoMensal).toFixed(1)}%`}
            </strong>
            .
          </li>
        </ul>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card
          titulo="Entradas x Saídas por mês"
          pergunta="Estou ganhando mais do que gasto?"
          comoLer="Barra verde é o dinheiro que entrou, a vermelha é o que saiu. Quando a verde é maior, o mês fechou positivo."
        >
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={r.porMes}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="mes" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} width={70} />
              <Tooltip content={<DicaValor />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar name="Entradas" dataKey="entradas" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
              <Bar name="Saídas" dataKey="saidas" fill="var(--chart-5)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card
          titulo="Saldo acumulado"
          pergunta="Meu caixa está crescendo ao longo do tempo?"
          comoLer="A linha soma o resultado de cada mês. Subindo, o caixa engorda; descendo, o dinheiro está sendo consumido."
        >
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={r.acumulado}>
              <defs>
                <linearGradient id="grad-acum" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="mes" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} width={70} />
              <Tooltip content={<DicaValor />} />
              <Area
                name="Acumulado"
                type="monotone"
                dataKey="acumulado"
                stroke="var(--chart-2)"
                fill="url(#grad-acum)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card
          titulo="Para onde vai o dinheiro"
          pergunta="Quais categorias mais consomem o caixa?"
          comoLer="Cada fatia é uma categoria de despesa. Quanto maior a fatia, maior o peso no orçamento."
        >
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={r.porCategoria}
                dataKey="valor"
                nameKey="categoria"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={3}
              >
                {r.porCategoria.map((_, i) => (
                  <Cell key={i} fill={CORES[i % CORES.length]} />
                ))}
              </Pie>
              <Tooltip content={<DicaValor />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card
          titulo="Resultado mês a mês"
          pergunta="Quais meses fecharam no vermelho?"
          comoLer="Cada ponto é o saldo do mês (entradas menos saídas). Pontos abaixo de zero indicam prejuízo naquele mês."
        >
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={r.porMes}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="mes" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} width={70} />
              <Tooltip content={<DicaValor />} />
              <Line
                name="Saldo"
                type="monotone"
                dataKey="saldo"
                stroke="var(--chart-3)"
                strokeWidth={2.5}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <section className="panel mt-6 overflow-hidden">
        <header className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Maiores despesas individuais</h2>
          <p className="text-xs text-muted-foreground">
            Os cinco lançamentos que mais pesaram no caixa. Comece por eles ao cortar custos.
          </p>
        </header>
        {r.topDespesas.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            Nenhuma despesa identificada nos dados.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {r.topDespesas.map((d, i) => (
              <li key={i} className="flex items-center gap-4 px-5 py-3">
                <span className="w-6 text-xs font-bold text-muted-foreground">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{d.descricao}</span>
                <span className="text-sm font-semibold text-destructive">
                  {brl(d.valor)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {usandoDemo && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Estes números são um exemplo.{" "}
          <Link to="/" className="text-primary underline-offset-4 hover:underline">
            Importe seus arquivos
          </Link>{" "}
          para ver os relatórios com os seus próprios dados.
        </p>
      )}
    </main>
  );
}

function Kpi({
  titulo,
  valor,
  explicacao,
  tom,
}: {
  titulo: string;
  valor: string;
  explicacao: string;
  tom: "primary" | "accent" | "destructive";
}) {
  const cor = {
    primary: "text-primary",
    accent: "text-accent",
    destructive: "text-destructive",
  }[tom];

  return (
    <div className="panel p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      <p className={`mt-2 text-2xl font-bold ${cor}`}>{valor}</p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{explicacao}</p>
    </div>
  );
}

function Card({
  titulo,
  pergunta,
  comoLer,
  children,
}: {
  titulo: string;
  pergunta: string;
  comoLer: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel flex flex-col p-5">
      <h2 className="text-base font-semibold">{titulo}</h2>
      <p className="mt-1 text-sm text-accent">{pergunta}</p>
      <div className="mt-4">{children}</div>
      <p className="mt-3 rounded-lg bg-secondary/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        <strong className="text-foreground">Como ler: </strong>
        {comoLer}
      </p>
    </section>
  );
}

function DicaValor({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      {label && <p className="mb-1 font-semibold">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: <strong>{brl(Number(p.value ?? 0))}</strong>
        </p>
      ))}
    </div>
  );
}
