import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Check,
  ChevronDown,
  Pencil,
  Plus,
  Receipt,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/contexts/LocaleContext";
import { executar } from "@/lib/acoes";
import { billsApi, type Bill } from "@/lib/db";
import { useContas } from "@/lib/aoVivo";
import { dayKey } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { agruparPorMes, situacaoDe, vencimentoDe, type Situacao } from "../contas";
import { dataDoDia } from "../formato";
import { ContaDialog, Confirmar } from "../Formularios";
import { BotaoIcone, Cartao, CartaoTopo, Esqueleto, Segmentado, Vazio } from "../ui";
import { useDinheiro } from "../valores";
import { useCores } from "../categorias";

// ==============================================
// Contas a pagar
// ==============================================
// Cada conta tem a data certinha de vencimento, o tipo (fixa do mês,
// parcela, fatura de cartão ou avulsa) e o valor. A tela mostra primeiro o
// que vence mais perto, quanto sai em cada mês e a lista mês a mês.

type Filtro = "abertas" | "pagas" | "todas";

const MESES_VISIVEIS = 3;

function idioma(locale: string) {
  return locale === "pt" ? "pt-BR" : "en-US";
}

export function useRotulosConta() {
  const { t } = useLocale();
  return {
    tipo(conta: Bill) {
      const nome =
        conta.tipo === "fixa"
          ? t("tipoFixa")
          : conta.tipo === "parcela"
            ? t("tipoParcela")
            : conta.tipo === "cartao"
              ? t("tipoCartao")
              : t("tipoAvulsa");
      return conta.parcela ? `${nome} · ${conta.parcela}` : nome;
    },
    situacao(situacao: Situacao, dias: number) {
      switch (situacao) {
        case "paga":
          return t("contaPaga");
        case "vencida":
          return dias === -1 ? t("vencidaOntem") : t("vencidaHa").replace("{n}", String(-dias));
        case "hoje":
          return t("avisoVenceHoje");
        case "amanha":
          return t("avisoVenceAmanha");
        default:
          return t("emNDias").replace("{n}", String(dias));
      }
    },
  };
}

export const ESTILO_TIPO: Record<string, string> = {
  fixa: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  parcela: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  cartao: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  avulsa: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
};

export const ESTILO_SITUACAO: Record<Situacao, string> = {
  paga: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  vencida: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
  hoje: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
  amanha: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  semana: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  futura: "bg-secondary text-muted-foreground",
};

function DataCartao({ vencimento, situacao }: { vencimento: string; situacao: Situacao }) {
  const { locale } = useLocale();
  const d = dataDoDia(vencimento);
  const mes = d.toLocaleDateString(idioma(locale), { month: "short" }).replace(".", "");
  const alerta = situacao === "vencida" || situacao === "hoje";
  return (
    <span
      className={cn(
        "flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-[14px] leading-none",
        situacao === "paga" ? "bg-secondary text-muted-foreground" : alerta ? "bg-rose-500/10 text-rose-700 dark:text-rose-400" : "bg-primary/10 text-primary"
      )}
    >
      <span className="text-lg font-bold tabular-nums">{d.getDate()}</span>
      <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide">{mes}</span>
    </span>
  );
}

function LinhaConta({ conta, vencimento, onEditar, onExcluir }: { conta: Bill; vencimento: string; onEditar: () => void; onExcluir: () => void }) {
  const { t } = useLocale();
  const dinheiro = useDinheiro();
  const rotulos = useRotulosConta();
  const { situacao, dias } = situacaoDe(conta);
  const alternar = () => executar(() => billsApi.update(conta.id, { paid: !conta.paid }), { erro: t("erroAoSalvar") });

  return (
    <li className="group flex items-center gap-3.5 rounded-2xl px-2 py-2.5 transition-colors hover:bg-secondary/60">
      <DataCartao vencimento={vencimento} situacao={situacao} />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-semibold", conta.paid && "text-muted-foreground line-through")}>{conta.name}</p>
        <div className="mt-1 flex min-w-0 items-center gap-2">
          <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold", ESTILO_TIPO[conta.tipo ?? "avulsa"])}>
            {rotulos.tipo(conta)}
          </span>
          <span className="truncate text-xs text-muted-foreground">{conta.category}</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={cn("text-sm font-bold tabular-nums", conta.paid && "text-muted-foreground")}>
          {dinheiro(conta.amount, { centavos: true })}
        </span>
        <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-semibold", ESTILO_SITUACAO[situacao])}>
          {rotulos.situacao(situacao, dias)}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={alternar}
          title={conta.paid ? t("financesMarkUnpaid") : t("financesMarkPaid")}
          aria-label={`${conta.paid ? t("financesMarkUnpaid") : t("financesMarkPaid")}: ${conta.name}`}
          className={cn(
            "grid h-8 w-8 place-items-center rounded-lg border transition-colors",
            conta.paid
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-muted-foreground hover:border-primary hover:text-primary"
          )}
        >
          <Check className="h-4 w-4" strokeWidth={3} />
        </button>
        <div className="flex w-0 overflow-hidden opacity-0 transition-all group-focus-within:w-16 group-focus-within:opacity-100 group-hover:w-16 group-hover:opacity-100">
          <BotaoIcone rotulo={t("financesEditBill")} onClick={onEditar}>
            <Pencil className="h-3.5 w-3.5" />
          </BotaoIcone>
          <BotaoIcone rotulo={t("financesDeleteBill")} onClick={onExcluir} className="hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </BotaoIcone>
        </div>
      </div>
    </li>
  );
}

export function ContasCard({ className }: { className?: string }) {
  const { t, locale } = useLocale();
  const quantas = (n: number) => (n === 1 ? t("umaConta") : t("nContas").replace("{n}", String(n)));
  const cores = useCores();
  const dinheiro = useDinheiro();
  const rotulos = useRotulosConta();
  const { itens, pronto } = useContas();
  const [filtro, setFiltro] = useState<Filtro>("abertas");
  const [todosMeses, setTodosMeses] = useState(false);
  const [dialogo, setDialogo] = useState<{ aberto: boolean; conta?: Bill }>({ aberto: false });
  const [excluir, setExcluir] = useState<Bill | null>(null);

  const hoje = dayKey();

  const resumo = useMemo(() => {
    const abertas = itens
      .filter((c) => !c.paid)
      .map((c) => ({ conta: c, vencimento: vencimentoDe(c, hoje), ...situacaoDe(c, hoje) }))
      .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    const em30 = abertas.filter((x) => x.dias >= 0 && x.dias <= 30);
    const vencidas = abertas.filter((x) => x.dias < 0);
    const meses = agruparPorMes(itens.filter((c) => !c.paid), hoje)
      .filter((g) => g.mes >= hoje.slice(0, 7))
      .slice(0, 6);
    return {
      proxima: abertas.find((x) => x.dias >= 0) ?? abertas[0],
      em30: em30.reduce((s, x) => s + x.conta.amount, 0),
      qtdEm30: em30.length,
      vencidas: vencidas.reduce((s, x) => s + x.conta.amount, 0),
      qtdVencidas: vencidas.length,
      totalAberto: abertas.reduce((s, x) => s + x.conta.amount, 0),
      qtdAberto: abertas.length,
      meses,
      maiorMes: Math.max(0, ...meses.map((m) => m.aPagar)),
    };
  }, [itens, hoje]);

  const grupos = useMemo(() => {
    const lista = filtro === "abertas" ? itens.filter((c) => !c.paid) : filtro === "pagas" ? itens.filter((c) => c.paid) : itens;
    const todos = agruparPorMes(lista, hoje);
    // Pagas: do mês mais recente para trás.
    return filtro === "pagas" ? todos.reverse() : todos;
  }, [itens, filtro, hoje]);
  const gruposVisiveis = todosMeses ? grupos : grupos.slice(0, MESES_VISIVEIS);

  const nomeMes = (mes: string, curto = false) => {
    const texto = dataDoDia(`${mes}-15`).toLocaleDateString(idioma(locale), curto ? { month: "short" } : { month: "long", year: "numeric" });
    return (texto.charAt(0).toUpperCase() + texto.slice(1)).replace(".", "");
  };

  const proxima = resumo.proxima;

  return (
    <Cartao className={className} id="contas">
      <CartaoTopo
        icone={<Receipt className="h-[18px] w-[18px] text-primary" />}
        titulo={t("contasTitulo")}
        subtitulo={t("contasSubtitulo")}
        acao={
          <div className="flex items-center gap-2">
            <Segmentado<Filtro>
              rotulo={t("contasTitulo")}
              valor={filtro}
              onChange={(f) => {
                setFiltro(f);
                setTodosMeses(false);
              }}
              opcoes={[
                { valor: "abertas", rotulo: t("filtroAPagar") },
                { valor: "pagas", rotulo: t("contaPagas") },
                { valor: "todas", rotulo: t("filtroTodas") },
              ]}
            />
            <BotaoIcone rotulo={t("financesNewBill")} onClick={() => setDialogo({ aberto: true })}>
              <Plus className="h-[18px] w-[18px]" />
            </BotaoIcone>
          </div>
        }
      />

      {!pronto ? (
        <Esqueleto linhas={3} />
      ) : itens.length === 0 ? (
        <Vazio className="min-h-[140px] flex-col gap-3">
          <span>{t("contasVazio")}</span>
          <Button variant="outline" size="sm" className="gap-1.5 rounded-lg" onClick={() => setDialogo({ aberto: true })}>
            <Plus className="h-4 w-4" /> {t("financesNewBill")}
          </Button>
        </Vazio>
      ) : (
        <>
          {/* Resumo: a próxima, quanto sai e como ficam os próximos meses */}
          <div className="mb-5 grid grid-cols-1 gap-3 xl:grid-cols-[1.1fr_0.9fr_1.2fr]">
            <div
              className={cn(
                "flex flex-col justify-between rounded-2xl border p-4",
                proxima && (proxima.situacao === "vencida" || proxima.situacao === "hoje")
                  ? "border-rose-500/25 bg-rose-500/[0.06]"
                  : "border-primary/20 bg-primary/[0.06]"
              )}
            >
              <p className="rotulo-kpi">{t("proximaAVencer")}</p>
              {proxima ? (
                <>
                  <div className="mt-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold">{proxima.conta.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {rotulos.tipo(proxima.conta)} ·{" "}
                        {dataDoDia(proxima.vencimento).toLocaleDateString(idioma(locale), { day: "2-digit", month: "2-digit", year: "numeric" })}
                      </p>
                    </div>
                    <p className="shrink-0 text-xl font-bold tabular-nums">{dinheiro(proxima.conta.amount, { centavos: true })}</p>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className={cn("rounded-md px-2 py-1 text-xs font-semibold", ESTILO_SITUACAO[proxima.situacao])}>
                      {proxima.situacao === "vencida" ? <AlertTriangle className="mr-1 inline h-3.5 w-3.5" /> : <CalendarClock className="mr-1 inline h-3.5 w-3.5" />}
                      {rotulos.situacao(proxima.situacao, proxima.dias)}
                    </span>
                    <Button
                      size="sm"
                      className="h-8 rounded-lg"
                      onClick={() => executar(() => billsApi.update(proxima.conta.id, { paid: true }), { erro: t("erroAoSalvar") })}
                    >
                      <Check className="mr-1 h-4 w-4" /> {t("financesMarkPaid")}
                    </Button>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">{t("nadaAPagar")}</p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div className="rounded-2xl border border-border/80 p-4">
                <p className="rotulo-kpi">{t("proximos30")}</p>
                <p className="mt-1.5 text-xl font-bold tabular-nums">{dinheiro(resumo.em30, { centavos: true })}</p>
                <p className="text-xs text-muted-foreground">{quantas(resumo.qtdEm30)}</p>
              </div>
              <div className={cn("rounded-2xl border p-4", resumo.qtdVencidas > 0 ? "border-rose-500/25 bg-rose-500/[0.06]" : "border-border/80")}>
                <p className="rotulo-kpi">{resumo.qtdVencidas > 0 ? t("contaVencidas") : t("totalEmAberto")}</p>
                <p className={cn("mt-1.5 text-xl font-bold tabular-nums", resumo.qtdVencidas > 0 && "text-negativo")}>
                  {dinheiro(resumo.qtdVencidas > 0 ? resumo.vencidas : resumo.totalAberto, { centavos: true })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {quantas(resumo.qtdVencidas > 0 ? resumo.qtdVencidas : resumo.qtdAberto)}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-border/80 p-4">
              <p className="rotulo-kpi">{t("aPagarPorMes")}</p>
              {resumo.meses.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">{t("nadaAPagar")}</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {resumo.meses.map((m) => (
                    <li key={m.mes} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 text-xs">
                      <span className="font-semibold text-muted-foreground">{nomeMes(m.mes, true)}</span>
                      <span className="h-2 overflow-hidden rounded-full bg-secondary">
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${resumo.maiorMes > 0 ? (m.aPagar / resumo.maiorMes) * 100 : 0}%`, backgroundColor: cores.serie("gastos") }}
                        />
                      </span>
                      <span className="w-[5.5rem] text-right font-semibold tabular-nums">{dinheiro(m.aPagar, { centavos: true })}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Lista mês a mês */}
          {grupos.length === 0 ? (
            <Vazio className="min-h-[90px]">{filtro === "pagas" ? t("nenhumaPaga") : t("nadaAPagar")}</Vazio>
          ) : (
            <div className="space-y-5">
              {gruposVisiveis.map((g) => (
                <section key={g.mes}>
                  <div className="mb-1.5 flex items-baseline justify-between border-b border-border/70 px-2 pb-2">
                    <h3 className="text-sm font-semibold">{nomeMes(g.mes)}</h3>
                    <p className="text-xs text-muted-foreground">
                      {g.aPagar > 0 && (
                        <>
                          {t("filtroAPagar")} <span className="font-semibold text-foreground">{dinheiro(g.aPagar, { centavos: true })}</span>
                        </>
                      )}
                      {g.aPagar > 0 && g.pago > 0 && " · "}
                      {g.pago > 0 && (
                        <>
                          {t("contaPagas")} <span className="font-semibold text-foreground">{dinheiro(g.pago, { centavos: true })}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <ul className="grid grid-cols-1 gap-x-6 2xl:grid-cols-2">
                    {g.contas.map(({ conta, vencimento }) => (
                      <LinhaConta
                        key={conta.id}
                        conta={conta}
                        vencimento={vencimento}
                        onEditar={() => setDialogo({ aberto: true, conta })}
                        onExcluir={() => setExcluir(conta)}
                      />
                    ))}
                  </ul>
                </section>
              ))}
              {grupos.length > MESES_VISIVEIS && (
                <button
                  type="button"
                  onClick={() => setTodosMeses((v) => !v)}
                  className="mx-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
                >
                  {todosMeses ? t("verMenos") : grupos.length - MESES_VISIVEIS === 1 ? t("verMaisUmMes") : t("verMaisMeses").replace("{n}", String(grupos.length - MESES_VISIVEIS))}
                  {todosMeses ? <ArrowRight className="h-3.5 w-3.5 -rotate-90" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          )}
        </>
      )}

      <ContaDialog aberto={dialogo.aberto} inicial={dialogo.conta} onFechar={() => setDialogo({ aberto: false })} />
      <Confirmar
        aberto={!!excluir}
        titulo={t("excluirContaTitulo").replace("{nome}", excluir ? `${excluir.name}${excluir.parcela ? ` ${excluir.parcela}` : ""}` : "")}
        onFechar={() => setExcluir(null)}
        onConfirmar={() => excluir && executar(() => billsApi.delete(excluir.id), { erro: t("erroAoExcluir") })}
      />
    </Cartao>
  );
}
