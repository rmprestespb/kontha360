import { useCallback, useMemo, useRef, useState } from "react";
import {
  ACCEPT_ATTR,
  formatBytes,
  getExtension,
  isSupported,
  parseFile,
  SUPPORTED_EXTENSIONS,
  type ParsedFile,
} from "@/lib/file-import/parsers";
import { Button } from "@/components/ui/button";

type Status = "pendente" | "processando" | "pronto" | "erro";

interface ImportItem {
  id: string;
  file: File;
  status: Status;
  error?: string;
  result?: ParsedFile;
}

const MAX_SIZE = 20 * 1024 * 1024;

export function FileImporter({
  onImport,
}: {
  onImport?: (files: ParsedFile[]) => void;
}) {
  const [items, setItems] = useState<ImportItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId],
  );

  const update = useCallback((id: string, patch: Partial<ImportItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }, []);

  const addFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const incoming = Array.from(fileList);
      const created: ImportItem[] = incoming.map((file) => ({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        status: "pendente",
      }));

      setItems((prev) => [...prev, ...created]);
      setSelectedId((prev) => prev ?? created[0]?.id ?? null);

      for (const item of created) {
        if (!isSupported(item.file.name)) {
          update(item.id, {
            status: "erro",
            error: `Formato .${getExtension(item.file.name) || "?"} não suportado.`,
          });
          continue;
        }
        if (item.file.size > MAX_SIZE) {
          update(item.id, {
            status: "erro",
            error: "Arquivo maior que 20 MB.",
          });
          continue;
        }

        update(item.id, { status: "processando" });
        try {
          const result = await parseFile(item.file);
          update(item.id, { status: "pronto", result });
        } catch (err) {
          update(item.id, {
            status: "erro",
            error: err instanceof Error ? err.message : "Falha ao ler o arquivo.",
          });
        }
      }
    },
    [update],
  );

  const ready = items.filter((i) => i.status === "pronto" && i.result);

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex flex-col gap-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          className={`panel flex cursor-pointer flex-col items-center justify-center gap-3 px-6 py-14 text-center transition-colors ${
            dragging ? "border-primary bg-secondary/60" : "hover:border-primary/60"
          }`}
        >
          <span className="text-4xl" aria-hidden>
            ⇪
          </span>
          <p className="text-base font-semibold">
            Arraste os arquivos ou clique para selecionar
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Leitura local no navegador — nada é enviado para servidores nesta etapa.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            {SUPPORTED_EXTENSIONS.map((ext) => (
              <span
                key={ext}
                className="rounded-md border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                .{ext}
              </span>
            ))}
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT_ATTR}
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        <div className="panel divide-y divide-border">
          <header className="flex items-center justify-between px-4 py-3">
            <h2 className="text-sm font-semibold">Fila de importação</h2>
            {items.length > 0 && (
              <button
                onClick={() => {
                  setItems([]);
                  setSelectedId(null);
                }}
                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Limpar
              </button>
            )}
          </header>

          {items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              Nenhum arquivo na fila.
            </p>
          ) : (
            <ul>
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => setSelectedId(item.id)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/60 ${
                      item.id === selectedId ? "bg-secondary/70" : ""
                    }`}
                  >
                    <span className="rounded-md bg-secondary px-2 py-1 text-[11px] font-bold uppercase text-accent">
                      {getExtension(item.file.name) || "?"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {item.file.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {formatBytes(item.file.size)}
                        {item.result
                          ? ` · ${item.result.rows.length} linha(s) detectada(s)`
                          : ""}
                        {item.error ? ` · ${item.error}` : ""}
                      </span>
                    </span>
                    <StatusBadge status={item.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Button
          disabled={ready.length === 0}
          onClick={() => onImport?.(ready.map((i) => i.result!))}
          className="w-full"
        >
          Importar {ready.length > 0 ? `${ready.length} arquivo(s)` : ""}
        </Button>
      </div>

      <PreviewPanel item={selected} />
    </section>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, string> = {
    pendente: "bg-secondary text-muted-foreground",
    processando: "bg-accent/20 text-accent",
    pronto: "bg-primary/20 text-primary",
    erro: "bg-destructive/20 text-destructive",
  };
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${map[status]}`}
    >
      {status}
    </span>
  );
}

function PreviewPanel({ item }: { item: ImportItem | null }) {
  const [tab, setTab] = useState<"tabela" | "texto">("tabela");

  if (!item || !item.result) {
    return (
      <div className="panel flex min-h-[320px] items-center justify-center p-8 text-center text-sm text-muted-foreground">
        Selecione um arquivo processado para visualizar o conteúdo extraído.
      </div>
    );
  }

  const { rows, text, warnings, fileName, extension } = item.result;
  const header = rows[0] ?? [];
  const body = rows.slice(1, 200);
  const colCount = Math.max(...rows.map((r) => r.length), 1);

  return (
    <div className="panel flex flex-col overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{fileName}</p>
          <p className="text-xs text-muted-foreground">
            .{extension} · {rows.length} linha(s) · {colCount} coluna(s)
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-secondary p-1">
          {(["tabela", "texto"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                tab === t
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      {warnings.length > 0 && (
        <ul className="border-b border-border bg-secondary/50 px-4 py-2 text-xs text-muted-foreground">
          {warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}

      <div className="max-h-[480px] overflow-auto">
        {tab === "tabela" ? (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-card">
              <tr>
                {Array.from({ length: colCount }).map((_, i) => (
                  <th
                    key={i}
                    className="border-b border-border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {header[i] || `Coluna ${i + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, r) => (
                <tr key={r} className="odd:bg-secondary/30">
                  {Array.from({ length: colCount }).map((_, c) => (
                    <td
                      key={c}
                      className="border-b border-border/60 px-3 py-2 align-top"
                    >
                      {row[c] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <pre className="whitespace-pre-wrap px-4 py-3 font-mono text-xs leading-relaxed text-muted-foreground">
            {text || "(vazio)"}
          </pre>
        )}
      </div>
    </div>
  );
}
