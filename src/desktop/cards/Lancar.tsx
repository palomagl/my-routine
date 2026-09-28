import { useState } from "react";
import { ArrowDownToLine, ArrowUpToLine, CalendarClock, Plus } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { useCores } from "../categorias";
import { ContaDialog, TransacaoDialog } from "../Formularios";

type Aberto = "expense" | "income" | "conta" | null;

/**
 * A faixa "Anotar" no topo de Finanças: um clique para lançar um gasto, uma
 * entrada ou uma conta a pagar (à vista, parcelada ou todo mês), sem ter que
 * procurar o "+" certo em cada card.
 */
export function LancarRapido() {
  const { t } = useLocale();
  const cores = useCores();
  const [aberto, setAberto] = useState<Aberto>(null);

  const botoes = [
    { chave: "expense" as const, Icone: ArrowDownToLine, cor: cores.serie("gastos"), rotulo: t("lancarGasto"), dica: t("lancarGastoDica") },
    { chave: "income" as const, Icone: ArrowUpToLine, cor: cores.serie("entradas"), rotulo: t("lancarEntrada"), dica: t("lancarEntradaDica") },
    { chave: "conta" as const, Icone: CalendarClock, cor: cores.serie("metas"), rotulo: t("lancarConta"), dica: t("lancarContaDica") },
  ];

  return (
    <section className="cartao flex items-center gap-3 p-2.5 pl-5 animate-fade-in" aria-label={t("lancarTitulo")}>
      <h2 className="shrink-0 text-sm font-semibold">{t("lancarTitulo")}</h2>
      <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
        {botoes.map(({ chave, Icone, cor, rotulo, dica }) => (
          <button
            key={chave}
            type="button"
            onClick={() => setAberto(chave)}
            className="group flex min-w-0 items-center gap-3 rounded-2xl border border-border/80 bg-card px-3 py-2 text-left transition-all hover:-translate-y-px hover:shadow-sm"
            style={{ ["--cor" as string]: cor }}
          >
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
              style={{ backgroundColor: `color-mix(in srgb, ${cor} 13%, transparent)` }}
            >
              <Icone className="h-[18px] w-[18px]" style={{ color: cor }} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{rotulo}</span>
              <span className="block truncate text-xs text-muted-foreground">{dica}</span>
            </span>
            <Plus className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-[var(--cor)]" />
          </button>
        ))}
      </div>

      <TransacaoDialog
        aberto={aberto === "expense" || aberto === "income"}
        tipoInicial={aberto === "income" ? "income" : "expense"}
        onFechar={() => setAberto(null)}
      />
      <ContaDialog aberto={aberto === "conta"} onFechar={() => setAberto(null)} />
    </section>
  );
}
