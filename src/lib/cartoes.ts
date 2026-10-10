// ==============================================
// Cartões de crédito: a que fatura cada compra pertence
// ==============================================
// Sem imports de Firebase: funções puras, para dar para testar e para o bot
// do Telegram (api/_lib) usar as mesmas regras que a tela usa.
//
// A ideia: comprar no crédito não tira dinheiro na hora. A compra entra na
// fatura que ainda está aberta e só mexe no saldo quando a fatura é paga.

export type BancoCartao = "nubank" | "santander" | "outro";

export interface Cartao {
  id: string;
  /** Como ela chama: "Paloma", "Neuza". */
  nome: string;
  banco: BancoCartao;
  /** Dia em que a fatura fecha (1–31). Compras depois dele caem na fatura seguinte. */
  fechamento: number;
  /** Dia do vencimento da fatura (1–31). */
  vencimento: number;
  criadoEm?: string;
}

/** Cor e rótulo de cada banco — o cartão na tela imita o cartão de verdade. */
export const BANCOS: Record<BancoCartao, { rotulo: string; de: string; para: string }> = {
  nubank: { rotulo: "Nubank", de: "#820AD1", para: "#5B0A93" },
  santander: { rotulo: "Santander", de: "#EC0000", para: "#A50000" },
  outro: { rotulo: "Cartão", de: "#3F3F46", para: "#18181B" },
};

/** "Nubank · Paloma" — como o cartão aparece escrito em qualquer lista. */
export function nomeCompleto(cartao: Pick<Cartao, "nome" | "banco">): string {
  return `${BANCOS[cartao.banco].rotulo} · ${cartao.nome}`;
}

function limitarAoMes(ano: number, mes1a12: number, dia: number): string {
  const ultimo = new Date(ano, mes1a12, 0).getDate();
  const d = Math.min(Math.max(dia, 1), ultimo);
  return `${ano}-${String(mes1a12).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Em que fatura ("YYYY-MM") cai uma compra feita em `data`.
 *
 * Comprou no dia do fechamento ou antes, entra na fatura deste mês; depois
 * dele, na do mês que vem — é assim que o cartão de verdade funciona.
 */
export function faturaDaCompra(data: string, fechamento: number): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  if (!ano || !mes || !dia) return data.slice(0, 7);
  if (dia <= fechamento) return `${ano}-${String(mes).padStart(2, "0")}`;
  const proximo = mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };
  return `${proximo.ano}-${String(proximo.mes).padStart(2, "0")}`;
}

/**
 * Quando a fatura de "YYYY-MM" vence ("YYYY-MM-DD").
 *
 * Quando o dia do vencimento vem ANTES do dia do fechamento (fecha dia 28,
 * vence dia 5), a fatura vence já no mês seguinte ao que ela fechou — é o
 * caso de quem tem vencimento no começo do mês.
 */
export function vencimentoDaFatura(faturaMes: string, cartao: Pick<Cartao, "fechamento" | "vencimento">): string {
  const [ano, mes] = faturaMes.split("-").map(Number);
  if (cartao.vencimento >= cartao.fechamento) return limitarAoMes(ano, mes, cartao.vencimento);
  const seguinte = mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };
  return limitarAoMes(seguinte.ano, seguinte.mes, cartao.vencimento);
}

/** Quando a fatura de "YYYY-MM" fecha ("YYYY-MM-DD"). */
export function fechamentoDaFatura(faturaMes: string, fechamento: number): string {
  const [ano, mes] = faturaMes.split("-").map(Number);
  return limitarAoMes(ano, mes, fechamento);
}

/** A fatura que está aberta hoje — a que recebe uma compra feita agora. */
export function faturaAberta(cartao: Pick<Cartao, "fechamento">, hoje: string): string {
  return faturaDaCompra(hoje, cartao.fechamento);
}

interface CompraMinima {
  amount: number;
  type: "income" | "expense";
  date: string;
  cardId?: string;
}

/** Soma das compras de um cartão numa fatura. Estorno (entrada) abate. */
export function totalDaFatura<T extends CompraMinima>(
  compras: T[],
  cartao: Pick<Cartao, "id" | "fechamento">,
  faturaMes: string
): number {
  return compras.reduce((soma, c) => {
    if (c.cardId !== cartao.id) return soma;
    if (faturaDaCompra(c.date, cartao.fechamento) !== faturaMes) return soma;
    return soma + (c.type === "income" ? -c.amount : c.amount);
  }, 0);
}

/** As compras de uma fatura, da mais nova para a mais velha. */
export function comprasDaFatura<T extends CompraMinima>(
  compras: T[],
  cartao: Pick<Cartao, "id" | "fechamento">,
  faturaMes: string
): T[] {
  return compras
    .filter((c) => c.cardId === cartao.id && faturaDaCompra(c.date, cartao.fechamento) === faturaMes)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Nome da conta que representa a fatura paga: é por ele que a tela sabe que
 * aquela fatura já foi paga e não a mostra de novo em aberto.
 */
export function nomeDaFatura(cartao: Pick<Cartao, "nome" | "banco">, faturaMes: string): string {
  const [ano, mes] = faturaMes.split("-");
  return `Fatura ${nomeCompleto(cartao)} · ${mes}/${ano}`;
}

/** O que a lista de contas a pagar precisa saber sobre uma fatura em aberto. */
export interface FaturaEmAberto {
  /** "fatura:<cardId>:<YYYY-MM>" — não existe no banco, é calculada na hora. */
  id: string;
  name: string;
  amount: number;
  /** Dia do mês, como as outras contas mostram. */
  dueDate: string;
  vencimento: string;
  category: string;
  tipo: "cartao";
  paid: false;
  cartaoId: string;
  faturaMes: string;
}

/**
 * As faturas que ainda não foram pagas, no formato das contas a pagar — é o
 * que faz a fatura do cartão aparecer junto do aluguel e da internet.
 *
 * `jaPaga` diz se já existe uma conta paga com aquele nome (quem paga a
 * fatura na tela cria essa conta, e aí a fatura some daqui).
 */
export function faturasEmAberto<T extends CompraMinima, C extends Cartao>(
  cartoes: C[],
  compras: T[],
  jaPaga: (nome: string) => boolean,
  hoje: string
): FaturaEmAberto[] {
  const faturas: FaturaEmAberto[] = [];
  for (const cartao of cartoes) {
    const mes = faturaAberta(cartao, hoje);
    const total = totalDaFatura(compras, cartao, mes);
    const nome = nomeDaFatura(cartao, mes);
    if (total <= 0 || jaPaga(nome)) continue;
    const vence = vencimentoDaFatura(mes, cartao);
    faturas.push({
      id: `fatura:${cartao.id}:${mes}`,
      name: nome,
      amount: total,
      dueDate: String(Number(vence.slice(8))),
      vencimento: vence,
      category: "Outros",
      tipo: "cartao",
      paid: false,
      cartaoId: cartao.id,
      faturaMes: mes,
    });
  }
  return faturas.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}

// ----------------------------------------------
// Achar o cartão pelo que a pessoa escreveu
// ----------------------------------------------

function semAcento(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export interface CartaoNoTexto<T> {
  /** Achou um só: é esse. */
  cartao: T | null;
  /** Achou mais de um que serve ("neuza", com dois cartões da Neuza). */
  ambiguos: T[];
  /** A pessoa falou em cartão (mesmo que não dê para saber qual). */
  mencionouCartao: boolean;
  /** O texto sem as palavras do cartão, para virar a descrição do gasto. */
  textoLimpo: string;
}

const PALAVRAS_CARTAO = ["cartao", "cartão", "credito", "crédito", "no cartao", "cc"];

/**
 * "gastei 50 de gasolina no cartão neuza nubank" -> cartão da Neuza do Nubank,
 * descrição "gasolina". Com dois cartões da Neuza e só "neuza" escrito, devolve
 * os dois em `ambiguos` para quem chamou perguntar qual é.
 */
export function acharCartaoNoTexto<T extends Pick<Cartao, "nome" | "banco">>(
  texto: string,
  cartoes: T[]
): CartaoNoTexto<T> {
  const limpo = semAcento(texto);
  const mencionouCartao = PALAVRAS_CARTAO.some((p) => limpo.includes(semAcento(p)));

  const temPalavra = (palavra: string) =>
    new RegExp(`(?<![\\p{L}])${palavra.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "u").test(limpo);

  const candidatos = cartoes.filter((c) => temPalavra(semAcento(c.nome)) || temPalavra(semAcento(BANCOS[c.banco].rotulo)));

  // "neuza nubank" é mais específico que só "neuza": quando alguma opção bate
  // no nome E no banco, as que batem só por um dos dois saem da disputa.
  const completos = candidatos.filter((c) => temPalavra(semAcento(c.nome)) && temPalavra(semAcento(BANCOS[c.banco].rotulo)));
  const finalistas = completos.length > 0 ? completos : candidatos;

  const palavrasDoCartao = new Set<string>();
  for (const c of finalistas) {
    palavrasDoCartao.add(semAcento(c.nome));
    palavrasDoCartao.add(semAcento(BANCOS[c.banco].rotulo));
  }
  for (const p of PALAVRAS_CARTAO) palavrasDoCartao.add(semAcento(p));

  const textoLimpo = texto
    .split(/\s+/)
    .filter((palavra) => palavra && !palavrasDoCartao.has(semAcento(palavra)))
    .join(" ")
    .trim();

  return {
    cartao: finalistas.length === 1 ? finalistas[0] : null,
    ambiguos: finalistas.length > 1 ? finalistas : [],
    mencionouCartao: mencionouCartao || candidatos.length > 0,
    textoLimpo,
  };
}
