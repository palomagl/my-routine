// Contas feitas em cima das transações — funções puras, sem Firestore.
import type { Bill, Carteira, Transaction } from "@/lib/db";
import { dayKey, lastNDays } from "@/lib/dates";

export type Periodo = "7d" | "30d" | "3m";
export const DIAS_DO_PERIODO: Record<Periodo, number> = { "7d": 7, "30d": 30, "3m": 90 };

/** As chaves de dia do período, terminando hoje. */
export function diasDoPeriodo(periodo: Periodo): string[] {
  return lastNDays(DIAS_DO_PERIODO[periodo]);
}

const sinal = (t: Transaction) => (t.type === "income" ? t.amount : -t.amount);

/**
 * Compra no crédito não tira dinheiro na hora: ela vai juntando na fatura e
 * só pesa no saldo quando a fatura é marcada como paga (aí vira uma conta
 * paga, como qualquer outra).
 */
const noCredito = (t: Transaction) => !!t.cardId;

type ComHora = Transaction & { criadaEm?: Date | null };

function depoisDoAjuste(carteira: Carteira) {
  const marco = Date.parse(carteira.definidoEm);
  return {
    transacao: (t: ComHora) => !!t.criadaEm && t.criadaEm.getTime() > marco,
    conta: (c: Bill) => c.paid && !!c.pagaEm && Date.parse(c.pagaEm) > marco,
  };
}

/**
 * Saldo atual.
 *
 * Com saldo ajustado (carteira): o que a pessoa disse que tinha, mais as
 * entradas e menos os gastos lançados depois disso, menos as contas marcadas
 * como pagas depois disso. O que já tinha acontecido antes já estava dentro
 * do valor informado.
 *
 * Sem ajuste: tudo que entrou menos tudo que saiu, incluindo as contas
 * pagas — a mesma conta que a tela de Finanças sempre fez.
 */
export function saldoAtual(transacoes: ComHora[], contas: Bill[], carteira?: Carteira | null): number {
  const noDinheiro = transacoes.filter((t) => !noCredito(t));
  if (carteira) {
    const depois = depoisDoAjuste(carteira);
    const base = carteira.saldos.reduce((s, x) => s + x.valor, 0);
    const liquido = noDinheiro.filter(depois.transacao).reduce((s, t) => s + sinal(t), 0);
    const pagas = contas.filter(depois.conta).reduce((s, c) => s + c.amount, 0);
    return base + liquido - pagas;
  }
  const liquido = noDinheiro.reduce((s, t) => s + sinal(t), 0);
  const pagas = contas.filter((c) => c.paid).reduce((s, c) => s + c.amount, 0);
  return liquido - pagas;
}

/** Entradas, gastos e saldo das transações de um mês ("YYYY-MM"). */
export function totaisDoMes(transacoes: Transaction[], mes: string) {
  let entradas = 0;
  let gastos = 0;
  for (const t of transacoes) {
    if (!t.date?.startsWith(mes)) continue;
    if (t.type === "income") entradas += t.amount;
    else gastos += t.amount;
  }
  return { entradas, gastos, saldo: entradas - gastos };
}

/** Soma por dia de um tipo (entradas ou gastos), na ordem dos dias. */
export function somaPorDia(transacoes: Transaction[], dias: string[], tipo: Transaction["type"]): number[] {
  const indice = new Map(dias.map((d, i) => [d, i]));
  const soma = dias.map(() => 0);
  for (const t of transacoes) {
    if (t.type !== tipo) continue;
    const i = indice.get(t.date);
    if (i !== undefined) soma[i] += t.amount;
  }
  return soma;
}

/** Saldo no fim de cada dia (para a linhazinha do card de saldo). */
export function saldoPorDia(transacoes: ComHora[], contas: Bill[], dias: string[], carteira?: Carteira | null): number[] {
  const final = saldoAtual(transacoes, contas, carteira);
  // Só o que mexe no saldo: com ajuste, o que veio depois dele.
  const depois = carteira ? depoisDoAjuste(carteira) : null;
  const contadas = depois ? transacoes.filter(depois.transacao) : transacoes;
  const entradas = somaPorDia(contadas, dias, "income");
  const gastos = somaPorDia(contadas, dias, "expense");
  const indice = new Map(dias.map((d, i) => [d, i]));
  const pagasNoDia = dias.map(() => 0);
  if (depois) {
    for (const c of contas.filter(depois.conta)) {
      const i = indice.get(dayKey(new Date(c.pagaEm!)));
      if (i !== undefined) pagasNoDia[i] += c.amount;
    }
  }
  const liquidos = dias.map((_, i) => entradas[i] - gastos[i] - pagasNoDia[i]);
  // Anda de trás pra frente a partir do saldo de hoje.
  const serie = new Array<number>(dias.length);
  let atual = final;
  for (let i = dias.length - 1; i >= 0; i--) {
    serie[i] = atual;
    atual -= liquidos[i];
  }
  return serie;
}

/** Entradas e gastos acumulados ao longo do período (gráfico de área). */
export function acumuladoNoPeriodo(transacoes: Transaction[], dias: string[]) {
  const entradas = somaPorDia(transacoes, dias, "income");
  const gastos = somaPorDia(transacoes, dias, "expense");
  let e = 0;
  let g = 0;
  return dias.map((dia, i) => {
    e += entradas[i];
    g += gastos[i];
    return { dia, entradas: e, gastos: g };
  });
}

export function transacoesDesde(transacoes: Transaction[], desde: string) {
  return transacoes.filter((t) => t.date >= desde);
}

/** Gastos por categoria, do maior para o menor. */
export function gastosPorCategoria(transacoes: Transaction[]) {
  const totais = new Map<string, number>();
  let total = 0;
  for (const t of transacoes) {
    if (t.type !== "expense") continue;
    const c = t.category || "Outros";
    totais.set(c, (totais.get(c) ?? 0) + t.amount);
    total += t.amount;
  }
  const lista = [...totais.entries()]
    .map(([categoria, valor]) => ({ categoria, valor, pct: total > 0 ? (valor / total) * 100 : 0 }))
    .sort((a, b) => b.valor - a.valor);
  return { lista, total };
}

/** Variação percentual; null quando não dá para comparar (mês anterior zerado). */
export function variacao(atual: number, anterior: number): number | null {
  if (anterior <= 0) return null;
  return ((atual - anterior) / anterior) * 100;
}

export function hojeChave() {
  return dayKey();
}

/** Valor digitado -> número. Aceita "12,50", "1.250,90", "12.5" e "R$ 30". */
export function lerValor(texto: string): number {
  const limpo = texto.trim().replace(/^r\$\s*/i, "");
  const numero = limpo.includes(",") ? Number(limpo.replace(/\./g, "").replace(",", ".")) : Number(limpo);
  return Number.isFinite(numero) ? numero : NaN;
}
