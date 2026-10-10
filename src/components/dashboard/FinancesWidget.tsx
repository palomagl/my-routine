import { useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpToLine, CalendarClock, Check, ChevronDown, Pencil, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import type { Bill, Transaction } from "@/lib/db";
import { billsApi } from "@/lib/db";
import { useCarteira, useCartoes, useContas, useTransacoes } from "@/lib/aoVivo";
import { faturasEmAberto } from "@/lib/cartoes";
import { dayKey } from "@/lib/dates";
import { executar } from "@/lib/acoes";
import { cn } from "@/lib/utils";
import { useLocale } from "@/contexts/LocaleContext";
import { saldoAtual, totaisDoMes } from "@/desktop/calculos";
import { situacaoDe, vencimentoDe } from "@/desktop/contas";
import { ESTILO_SITUACAO, ESTILO_TIPO, useRotulosConta } from "@/desktop/cards/Contas";
import { AjustarSaldoDialog, ContaDialog, TransacaoDialog } from "@/desktop/Formularios";
import { Cartoes } from "@/components/financas/Cartoes";

// Finanças no celular, direto ao ponto, numa rolagem só:
//   1. quanto tenho (toque para ajustar),
//   2. anotar gasto, entrada ou conta,
//   3. o mês em uma linha,
//   4. as próximas contas a pagar,
//   5. os últimos lançamentos.
// Os dados vêm ao vivo (um gasto mandado pelo Telegram aparece na hora) e
// criar ou editar abre os mesmos formulários do computador.

const reais = (v: number, centavos = true) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: centavos ? 2 : 0, maximumFractionDigits: centavos ? 2 : 0 })}`;

/** "2026-09-22" -> "22/09". */
const diaMes = (chave: string) => `${chave.slice(8)}/${chave.slice(5, 7)}`;

type Dialogo =
  | { tipo: "transacao"; inicial?: Transaction; tipoInicial?: Transaction["type"] }
  | { tipo: "conta"; inicial?: Bill }
  | { tipo: "saldo" }
  | null;

const POUCAS = 4;

/** Fatura de cartão: não existe no banco, então não dá para editar nem desmarcar. */
const ehFatura = (conta: Bill) => conta.id.startsWith("fatura:");

export function FinancesWidget() {
  const { t, locale } = useLocale();
  const rotulos = useRotulosConta();
  const contas = useContas().itens;
  const transacoes = useTransacoes().itens;
  const cartoes = useCartoes().itens;
  const carteira = useCarteira();
  const [todasContas, setTodasContas] = useState(false);
  const [verPagas, setVerPagas] = useState(false);
  const [todosLancamentos, setTodosLancamentos] = useState(false);
  const [dialogo, setDialogo] = useState<Dialogo>(null);

  const hoje = dayKey();
  const d = useMemo(() => {
    const mes = totaisDoMes(transacoes, hoje.slice(0, 7));
    const fimDoMes = `${hoje.slice(0, 7)}-31`;
    // As faturas em aberto entram na lista como contas: elas não existem no
    // banco (são a soma das compras do cartão), mas é no meio do aluguel e da
    // internet que ela quer ver quanto o cartão já deve.
    const pagas = new Set(contas.filter((c) => c.paid).map((c) => c.name));
    const faturas = faturasEmAberto(cartoes, transacoes, (nome) => pagas.has(nome), hoje);
    const comData = [...contas, ...(faturas as unknown as Bill[])].map((c) => ({
      conta: c,
      vencimento: vencimentoDe(c, hoje),
      ...situacaoDe(c, hoje),
    }));
    return {
      entradas: mes.entradas,
      gastos: mes.gastos,
      saldo: saldoAtual(transacoes, contas, carteira ?? null),
      aPagarNoMes: comData.filter((x) => !x.conta.paid && x.vencimento <= fimDoMes).reduce((s, x) => s + x.conta.amount, 0),
      abertas: comData.filter((x) => !x.conta.paid).sort((a, b) => a.vencimento.localeCompare(b.vencimento)),
      pagas: comData.filter((x) => x.conta.paid).sort((a, b) => b.vencimento.localeCompare(a.vencimento)),
    };
  }, [transacoes, contas, cartoes, carteira, hoje]);

  // Pagar uma fatura não é "marcar como paga": ela vira uma conta paga de
  // verdade, e é essa conta que desconta do saldo. O resto é como sempre.
  const alternarPaga = (conta: Bill) =>
    executar(
      async () => {
        if (!ehFatura(conta)) {
          await billsApi.update(conta.id, { paid: !conta.paid });
          return;
        }
        await billsApi.create({
          name: conta.name,
          amount: conta.amount,
          dueDate: conta.dueDate,
          vencimento: conta.vencimento,
          category: conta.category,
          tipo: "cartao",
          paid: true,
        });
      },
      { erro: t("erroAoSalvar") }
    );

  const fechar = () => setDialogo(null);
  const listaContas = verPagas ? d.pagas : d.abertas;
  const contasVisiveis = todasContas ? listaContas : listaContas.slice(0, POUCAS);
  const lancamentos = todosLancamentos ? transacoes.slice(0, 30) : transacoes.slice(0, 5);
  const nomeMes = new Date(`${hoje}T12:00:00`).toLocaleDateString(locale === "pt" ? "pt-BR" : "en-US", { month: "long" });

  return (
    <div className="space-y-4">
      {/* 1. Quanto tenho */}
      <button
        type="button"
        onClick={() => setDialogo({ tipo: "saldo" })}
        className="glass-card flex w-full items-center justify-between gap-3 rounded-2xl p-5 text-left animate-fade-in"
      >
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Wallet className="h-4 w-4 text-widget-finance" /> {t("saldoAtual")}
          </span>
          <span className={cn("mt-1 block text-[32px] font-bold leading-none tracking-tight tabular-nums", d.saldo < 0 && "text-rose-500")}>
            {carteira === undefined ? "—" : reais(d.saldo)}
          </span>
          <span className="mt-1.5 block text-xs text-muted-foreground">
            {carteira ? t("ajustadoEm").replace("{dia}", diaMes(dayKey(new Date(carteira.definidoEm)))) : t("toqueParaInformar")}
          </span>
        </span>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-widget-finance/10 text-widget-finance">
          <Pencil className="h-4 w-4" />
          <span className="sr-only">{t("ajustarSaldo")}</span>
        </span>
      </button>

      {/* 2. Anotar */}
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            { chave: "expense", Icone: ArrowDownToLine, rotulo: t("lancarGasto"), cor: "text-rose-500 bg-rose-500/10" },
            { chave: "income", Icone: ArrowUpToLine, rotulo: t("lancarEntrada"), cor: "text-violet-500 bg-violet-500/10" },
            { chave: "conta", Icone: CalendarClock, rotulo: t("lancarContaCurto"), cor: "text-amber-500 bg-amber-500/10" },
          ] as const
        ).map(({ chave, Icone, rotulo, cor }) => (
          <button
            key={chave}
            type="button"
            onClick={() => setDialogo(chave === "conta" ? { tipo: "conta" } : { tipo: "transacao", tipoInicial: chave })}
            className="glass-card flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center text-xs font-semibold transition-transform active:scale-[0.97]"
          >
            <span className={cn("grid h-9 w-9 place-items-center rounded-xl", cor)}>
              <Icone className="h-[18px] w-[18px]" />
            </span>
            + {rotulo}
          </button>
        ))}
      </div>

      {/* 3. O mês numa linha */}
      <div className="glass-card rounded-2xl px-2 pb-3 pt-2.5">
        <p className="mb-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">{nomeMes}</p>
        <div className="grid grid-cols-3 divide-x divide-border/60 text-center">
          <div className="px-2">
            <p className="text-[11px] text-muted-foreground">{t("mesEntrou")}</p>
            <p className="text-sm font-semibold text-emerald-500 tabular-nums">{reais(d.entradas, false)}</p>
          </div>
          <div className="px-2">
            <p className="text-[11px] text-muted-foreground">{t("mesSaiu")}</p>
            <p className="text-sm font-semibold text-rose-500 tabular-nums">{reais(d.gastos, false)}</p>
          </div>
          <div className="px-2">
            <p className="text-[11px] text-muted-foreground">{t("mesAPagar")}</p>
            <p className="text-sm font-semibold text-amber-600 dark:text-amber-400 tabular-nums">{reais(d.aPagarNoMes, false)}</p>
          </div>
        </div>
      </div>

      {/* 4. Contas */}
      <section className="glass-card rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            {verPagas ? t("contasPagas") : t("proximasContas")}
          </h3>
          <button
            type="button"
            onClick={() => {
              setVerPagas((v) => !v);
              setTodasContas(false);
            }}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          >
            {verPagas ? t("verAPagar") : `${t("filtroPagas")} (${d.pagas.length})`}
          </button>
        </div>

        <div className="space-y-2">
          {listaContas.length === 0 && <p className="py-5 text-center text-sm text-muted-foreground">{verPagas ? t("nenhumaPaga") : t("nadaAPagar")}</p>}
          {contasVisiveis.map(({ conta, vencimento, situacao, dias }) => {
            const atrasada = !conta.paid && (situacao === "vencida" || situacao === "hoje");
            return (
              <div key={conta.id} className={cn("flex items-center gap-3 rounded-xl p-2.5", conta.paid ? "bg-emerald-500/5" : "bg-secondary/50")}>
                <span
                  className={cn(
                    "grid h-11 w-11 shrink-0 place-items-center rounded-lg text-center leading-none",
                    atrasada ? "bg-rose-500/10 text-rose-600 dark:text-rose-400" : "bg-background/70"
                  )}
                >
                  <span>
                    <span className="block text-base font-bold tabular-nums">{Number(vencimento.slice(8))}</span>
                    <span className="block text-[9px] font-semibold uppercase text-muted-foreground">
                      {new Date(`${vencimento}T12:00:00`).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}
                    </span>
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => !ehFatura(conta) && setDialogo({ tipo: "conta", inicial: conta })}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={cn("truncate text-sm font-medium", conta.paid && "text-muted-foreground line-through")}>{conta.name}</span>
                    <span className={cn("shrink-0 text-sm font-semibold tabular-nums", conta.paid && "text-muted-foreground")}>{reais(conta.amount)}</span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px]">
                    {conta.tipo && conta.tipo !== "avulsa" && (
                      <span className={cn("rounded px-1 py-px font-semibold", ESTILO_TIPO[conta.tipo])}>{rotulos.tipo(conta)}</span>
                    )}
                    {!conta.paid && (
                      <span className={cn("rounded px-1 py-px font-semibold", ESTILO_SITUACAO[situacao])}>{rotulos.situacao(situacao, dias)}</span>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => alternarPaga(conta)}
                  aria-label={conta.paid ? t("financesMarkUnpaid") : t("financesMarkPaid")}
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 transition-colors",
                    conta.paid ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground/40 text-transparent active:border-emerald-500 active:text-emerald-500"
                  )}
                >
                  <Check className="h-4 w-4" strokeWidth={3} />
                </button>
              </div>
            );
          })}
        </div>
        {listaContas.length > POUCAS && (
          <button
            type="button"
            onClick={() => setTodasContas((v) => !v)}
            className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg py-2 text-xs font-semibold text-widget-finance"
          >
            {todasContas ? t("verMenos") : t("verTodasN").replace("{n}", String(listaContas.length))}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", todasContas && "rotate-180")} />
          </button>
        )}
      </section>

      {/* 5. Últimos lançamentos */}
      <section className="glass-card rounded-2xl p-4">
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <span className="h-2 w-2 rounded-full bg-widget-finance" />
          {t("ultimosLancamentos")}
        </h3>
        <div className="space-y-1">
          {transacoes.length === 0 && <p className="py-5 text-center text-sm text-muted-foreground">{t("semLancamentos")}</p>}
          {lancamentos.map((tr) => (
            <button
              key={tr.id}
              type="button"
              onClick={() => setDialogo({ tipo: "transacao", inicial: tr })}
              className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors active:bg-secondary"
            >
              <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", tr.type === "income" ? "bg-emerald-500/10" : "bg-rose-500/10")}>
                {tr.type === "income" ? <TrendingUp className="h-4 w-4 text-emerald-500" /> : <TrendingDown className="h-4 w-4 text-rose-500" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{tr.description}</span>
                <span className="block text-xs text-muted-foreground">
                  {diaMes(tr.date)} · {tr.category ?? "Outros"}
                </span>
              </span>
              <span className={cn("shrink-0 text-sm font-semibold tabular-nums", tr.type === "income" ? "text-emerald-500" : "text-rose-500")}>
                {tr.type === "income" ? "+" : "−"} {reais(tr.amount)}
              </span>
            </button>
          ))}
        </div>
        {transacoes.length > 5 && (
          <button
            type="button"
            onClick={() => setTodosLancamentos((v) => !v)}
            className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg py-2 text-xs font-semibold text-widget-finance"
          >
            {todosLancamentos ? t("verMenos") : t("verMais")}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", todosLancamentos && "rotate-180")} />
          </button>
        )}
      </section>

      {/* 6. Cartões de crédito */}
      <Cartoes aoEditarCompra={(compra) => setDialogo({ tipo: "transacao", inicial: compra })} />

      <TransacaoDialog
        aberto={dialogo?.tipo === "transacao"}
        inicial={dialogo?.tipo === "transacao" ? dialogo.inicial : undefined}
        tipoInicial={dialogo?.tipo === "transacao" ? dialogo.tipoInicial : undefined}
        onFechar={fechar}
      />
      <ContaDialog aberto={dialogo?.tipo === "conta"} inicial={dialogo?.tipo === "conta" ? dialogo.inicial : undefined} onFechar={fechar} />
      <AjustarSaldoDialog aberto={dialogo?.tipo === "saldo"} onFechar={fechar} carteira={carteira} saldoCalculado={d.saldo} />
    </div>
  );
}
