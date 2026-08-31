import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FileImporter } from "@/components/import/FileImporter";
import type { ParsedFile } from "@/lib/file-import/parsers";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Importador de Arquivos | Módulo de Fluxo de Caixa" },
      {
        name: "description",
        content:
          "Importe CSV, XML, MD, DOCX, DOC, ODT, RTF e PDF direto no navegador e visualize os dados extraídos antes de enviar ao fluxo de caixa.",
      },
      { property: "og:title", content: "Importador de Arquivos | Fluxo de Caixa" },
      {
        property: "og:description",
        content:
          "Módulo de importação multiformato com leitura local, pré-visualização em tabela e texto extraído.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [imported, setImported] = useState<ParsedFile[] | null>(null);

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-12 md:py-16">
      <header className="mb-10 max-w-2xl">
        <p className="mb-3 inline-block rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Módulo isolado
        </p>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
          <span className="text-gradient-brand">Importação de arquivos</span>
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          Bloco pronto para ser acoplado ao sistema de fluxo de caixa. Lê CSV, XML,
          MD, DOCX, DOC, ODT, RTF e PDF no próprio navegador e entrega os dados
          normalizados via callback <code className="text-foreground">onImport</code>.
        </p>
      </header>

      <FileImporter onImport={setImported} />

      {imported && (
        <div className="panel mt-8 p-5">
          <h2 className="text-sm font-semibold">Payload gerado</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Estrutura entregue ao sistema receptor ({imported.length} arquivo(s)).
          </p>
          <pre className="max-h-72 overflow-auto rounded-lg bg-secondary p-3 font-mono text-xs text-muted-foreground">
            {JSON.stringify(
              imported.map((f) => ({
                fileName: f.fileName,
                extension: f.extension,
                sizeBytes: f.sizeBytes,
                rows: f.rows.slice(0, 5),
                totalRows: f.rows.length,
              })),
              null,
              2,
            )}
          </pre>
        </div>
      )}
    </main>
  );
}
