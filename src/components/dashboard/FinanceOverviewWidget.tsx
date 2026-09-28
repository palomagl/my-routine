import { useState, useEffect, useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Utensils, Car, Home, Ticket, HeartPulse, Repeat, GraduationCap, MoreHorizontal, LucideIcon } from "lucide-react";
import { transactionsApi, Transaction, CategoriaTransacao } from "@/lib/db";
import { dayKey } from "@/lib/dates";
import { useLocale } from "@/contexts/LocaleContext";

type Periodo = "7d" | "30d" | "3m";

const DIAS_DO_PERIODO: Record<Periodo, number> = { "7d": 7, "30d": 30, "3m": 90 };

const CATEGORIA_ICONE: Record<CategoriaTransacao, LucideIcon> = {
  "Alimentação": Utensils,
  "Transporte": Car,
  "Moradia": Home,
  "Lazer": Ticket,
  "Saúde": HeartPulse,
  "Assinaturas": Repeat,
  "Estudos": GraduationCap,
  "Outros": MoreHorizontal,
};

const CATEGORIA_COR: Record<CategoriaTransacao, string> = {
  "Alimentação": "hsl(var(--widget-focus))",
  "Transporte": "hsl(var(--widget-finance))",
  "Moradia": "hsl(var(--widget-habits))",
  "Lazer": "hsl(var(--widget-goals))",
  "Saúde": "hsl(var(--destructive))",
  "Assinaturas": "hsl(var(--widget-notes))",
  "Estudos": "hsl(var(--primary))",
  "Outros": "hsl(var(--widget-tasks))",
};

const COR_GASTOS = "hsl(var(--destructive))";
const COR_ENTRADAS = "hsl(var(--widget-tasks))";

/** "2026-09-24" -> chave do dia N dias atrás, pra filtrar por período sem precisar de índice novo no Firestore. */
function corteDoPeriodo(periodo: Periodo): string {
  const dias = DIAS_DO_PERIODO[periodo];
  const data = new Date();
  data.setDate(data.getDate() - (dias - 1));
  return dayKey(data);
}

function formatarReais(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

/**
 * Resumo Financeiro (gastos x entradas) e despesas por categoria, lado a
 * lado — só aparece em telas grandes (quem monta decide isso, aqui é só o
 * conteúdo). Os dois compartilham o mesmo seletor de período e a mesma
 * lista de transações já carregada, pra não duplicar leitura do Firestore.
 */
export function FinanceOverviewWidget() {
  const { t } = useLocale();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [periodo, setPeriodo] = useState<Periodo>("30d");

  useEffect(() => {
    transactionsApi.list().then(setTransactions).catch(() => {});
  }, []);

  const doPeriodo = useMemo(() => {
    const corte = corteDoPeriodo(periodo);
    return transactions.filter((tx) => tx.date >= corte);
  }, [transactions, periodo]);

  const { totalGastos, totalEntradas } = useMemo(() => {
    let gastos = 0;
    let entradas = 0;
    for (const tx of doPeriodo) {
      if (tx.type === "expense") gastos += tx.amount;
      else entradas += tx.amount;
    }
    return { totalGastos: gastos, totalEntradas: entradas };
  }, [doPeriodo]);

  const saldoPeriodo = totalEntradas - totalGastos;
  const totalMovimentado = totalGastos + totalEntradas;

  const dadosRosca = useMemo(
    () =>
      [
        { name: t("financeOverviewExpenses"), value: totalGastos, color: COR_GASTOS },
        { name: t("financeOverviewIncome"), value: totalEntradas, color: COR_ENTRADAS },
      ].filter((fatia) => fatia.value > 0),
    [totalGastos, totalEntradas, t]
  );

  const categorias = useMemo(() => {
    const totais = new Map<CategoriaTransacao, number>();
    for (const tx of doPeriodo) {
      if (tx.type !== "expense") continue;
      const categoria = tx.category ?? "Outros";
      totais.set(categoria, (totais.get(categoria) ?? 0) + tx.amount);
    }
    return [...totais.entries()]
      .map(([categoria, valor]) => ({ categoria, valor, percentual: totalGastos > 0 ? (valor / totalGastos) * 100 : 0 }))
      .sort((a, b) => b.valor - a.valor);
  }, [doPeriodo, totalGastos]);

  const semDados = totalMovimentado === 0;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
      {/* Resumo Financeiro — rosca de gastos x entradas */}
      <div className="glass-card glass-card-hover rounded-2xl p-6 animate-fade-in">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-semibold text-lg">{t("financeOverviewTitle")}</h3>
            <p className="text-sm text-muted-foreground capitalize">{t(`financePeriod${periodo === "7d" ? "7d" : periodo === "30d" ? "30d" : "3m"}` as "financePeriod7d")}</p>
          </div>
          <div className="flex gap-1 rounded-full border border-border/60 bg-secondary/30 p-1">
            {(["7d", "30d", "3m"] as Periodo[]).map((opcao) => (
              <button
                key={opcao}
                type="button"
                onClick={() => setPeriodo(opcao)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  periodo === opcao ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(opcao === "7d" ? "financePeriod7d" : opcao === "30d" ? "financePeriod30d" : "financePeriod3m")}
              </button>
            ))}
          </div>
        </div>

        {semDados ? (
          <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">
            {t("financeCategoryEmpty")}
          </div>
        ) : (
          <div className="flex items-center gap-6">
            <div className="relative h-[160px] w-[160px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={dadosRosca} dataKey="value" nameKey="name" innerRadius={52} outerRadius={72} paddingAngle={dadosRosca.length > 1 ? 3 : 0} strokeWidth={0}>
                    {dadosRosca.map((fatia) => (
                      <Cell key={fatia.name} fill={fatia.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-lg font-bold">{formatarReais(saldoPeriodo)}</span>
                <span className="text-[11px] text-muted-foreground">{t("financeOverviewBalance")}</span>
              </div>
            </div>

            <div className="flex-1 space-y-3 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm text-muted-foreground truncate">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COR_GASTOS }} />
                  {t("financeOverviewExpenses")}
                </span>
                <span className="text-sm font-semibold">{formatarReais(totalGastos)}</span>
                <span className="text-xs text-muted-foreground w-9 text-right shrink-0">
                  {totalMovimentado > 0 ? Math.round((totalGastos / totalMovimentado) * 100) : 0}%
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm text-muted-foreground truncate">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COR_ENTRADAS }} />
                  {t("financeOverviewIncome")}
                </span>
                <span className="text-sm font-semibold">{formatarReais(totalEntradas)}</span>
                <span className="text-xs text-muted-foreground w-9 text-right shrink-0">
                  {totalMovimentado > 0 ? Math.round((totalEntradas / totalMovimentado) * 100) : 0}%
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Despesas por categoria */}
      <div className="glass-card glass-card-hover rounded-2xl p-6 animate-fade-in" style={{ animationDelay: "50ms" }}>
        <div className="mb-4">
          <h3 className="font-semibold text-lg">{t("financeCategoryTitle")}</h3>
          <p className="text-sm text-muted-foreground">{t(periodo === "7d" ? "financePeriod7d" : periodo === "30d" ? "financePeriod30d" : "financePeriod3m")}</p>
        </div>

        {categorias.length === 0 ? (
          <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">
            {t("financeCategoryEmpty")}
          </div>
        ) : (
          <div className="space-y-3">
            {categorias.map(({ categoria, valor, percentual }) => {
              const Icone = CATEGORIA_ICONE[categoria];
              const cor = CATEGORIA_COR[categoria];
              return (
                <div key={categoria} className="flex items-center gap-3">
                  <div className="p-1.5 rounded-lg shrink-0" style={{ backgroundColor: `${cor}1a` }}>
                    <Icone className="w-4 h-4" style={{ color: cor }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm truncate">{categoria}</span>
                      <span className="text-sm font-medium shrink-0">{formatarReais(valor)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary/50 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${percentual}%`, backgroundColor: cor }} />
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground w-9 text-right shrink-0">{Math.round(percentual)}%</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
