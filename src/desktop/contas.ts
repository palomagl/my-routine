// ==============================================
// Contas a pagar — regras puras (sem Firestore, sem React)
// ==============================================
// Datas de vencimento, parcelas, "vence em quantos dias", agrupamento por
// mês e a leitura da planilha (CSV) que importa as contas.

import type { Bill, TipoConta } from "@/lib/db";
import { dayKey } from "@/lib/dates";
import { lerValor } from "./calculos";

// ----------------------------------------------
// Datas
// ----------------------------------------------

function partes(chave: string) {
  const [ano, mes, dia] = chave.split("-").map(Number);
  return { ano, mes, dia };
}

function montar(ano: number, mes: number, dia: number) {
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function diasNoMes(ano: number, mes: number) {
  return new Date(ano, mes, 0).getDate();
}

/** "2026-01-31" + 1 mês = "2026-02-28": o dia encosta no fim do mês quando não existe. */
export function somarMeses(chave: string, n: number): string {
  const { ano, mes, dia } = partes(chave);
  const total = ano * 12 + (mes - 1) + n;
  const novoAno = Math.floor(total / 12);
  const novoMes = (total % 12) + 1;
  return montar(novoAno, novoMes, Math.min(dia, diasNoMes(novoAno, novoMes)));
}

/** Dias de `de` até `ate` (negativo = já passou). */
export function diasEntre(de: string, ate: string): number {
  const a = partes(de);
  const b = partes(ate);
  return Math.round((Date.UTC(b.ano, b.mes - 1, b.dia) - Date.UTC(a.ano, a.mes - 1, a.dia)) / 86_400_000);
}

/**
 * Quando a conta vence. Contas antigas só guardavam o dia do mês ("10"):
 * elas vencem naquele dia do mês atual, como sempre foram tratadas.
 */
export function vencimentoDe(conta: Pick<Bill, "vencimento" | "dueDate">, hoje: string = dayKey()): string {
  if (conta.vencimento) return conta.vencimento;
  const { ano, mes } = partes(hoje);
  const dia = parseInt(conta.dueDate, 10);
  const valido = Number.isFinite(dia) && dia >= 1 ? dia : 1;
  return montar(ano, mes, Math.min(valido, diasNoMes(ano, mes)));
}

export type Situacao = "paga" | "vencida" | "hoje" | "amanha" | "semana" | "futura";

export function situacaoDe(conta: Bill, hoje: string = dayKey()): { situacao: Situacao; dias: number } {
  const dias = diasEntre(hoje, vencimentoDe(conta, hoje));
  if (conta.paid) return { situacao: "paga", dias };
  if (dias < 0) return { situacao: "vencida", dias };
  if (dias === 0) return { situacao: "hoje", dias };
  if (dias === 1) return { situacao: "amanha", dias };
  if (dias <= 7) return { situacao: "semana", dias };
  return { situacao: "futura", dias };
}

// ----------------------------------------------
// Nome, parcela, tipo e categoria
// ----------------------------------------------

export const CATEGORIAS_CONTA = [
  "Cartão",
  "Compras",
  "Serviços",
  "Moradia",
  "Estudos",
  "Assinaturas",
  "Saúde",
  "Lazer",
  "Outros",
];

/** "Internet - 1/12" -> { nome: "Internet", parcela: "1/12" } */
export function separarParcela(descricao: string): { nome: string; parcela?: string } {
  const texto = descricao.trim();
  const achou = texto.match(/^(.*?)\s*[-–—]?\s*\(?\s*(\d{1,3})\s*\/\s*(\d{1,3})\s*\)?\s*$/);
  if (achou && achou[1].trim() && Number(achou[2]) >= 1 && Number(achou[2]) <= Number(achou[3])) {
    return { nome: achou[1].trim(), parcela: `${Number(achou[2])}/${Number(achou[3])}` };
  }
  return { nome: texto };
}

const REGRAS: [RegExp, string, TipoConta][] = [
  [/\b(cart[aã]o|card|fatura|nubank)\b/i, "Cartão", "cartao"],
  [/internet|wi-?fi|\bluz\b|energia|[aá]gua|telefone|celular|\bg[aá]s\b|tv a cabo/i, "Serviços", "fixa"],
  [/aluguel|condom[ií]nio|iptu|financiamento/i, "Moradia", "fixa"],
  // Estudos antes de Assinaturas e Compras: o Claude e o notebook são para estudar.
  [/faculdade|curso|escola|mensalidade|matr[ií]cula|ingl[eê]s|idioma|udemy|alura|claude|chatgpt/i, "Estudos", "fixa"],
  [/laptop|notebook|livro|apostila|material escolar/i, "Estudos", "avulsa"],
  [/netflix|spotify|prime video|disney|youtube|icloud|\bhbo\b|assinatura|deezer|globoplay/i, "Assinaturas", "fixa"],
  [/academia|farm[aá]cia|plano de sa[uú]de|m[eé]dic|dentista|consulta/i, "Saúde", "avulsa"],
  [/loja|mercado ?livre|shopee|amazon|shein|roupa|t[eê]nis|sapato|bolsa|celular|fone|gang|laptop|notebook|magalu|americanas|renner|riachuelo|zara|compra/i, "Compras", "avulsa"],
];

/** Palpite de categoria e tipo pelo nome. Dá para trocar depois, na edição. */
export function classificar(nome: string, parcela?: string): { categoria: string; tipo: TipoConta } {
  const regra = REGRAS.find(([re]) => re.test(nome));
  const categoria = regra?.[1] ?? "Outros";
  let tipo: TipoConta = regra?.[2] ?? "avulsa";
  // Numerada ("1/3") e não é conta fixa nem cartão: é compra parcelada.
  if (parcela && tipo !== "fixa" && tipo !== "cartao") tipo = "parcela";
  return { categoria, tipo };
}

// ----------------------------------------------
// Parcelas e repetições (formulário)
// ----------------------------------------------

/** Divide um total em `n` parcelas com os centavos certos: a última leva a sobra. */
export function dividirEmParcelas(total: number, n: number): number[] {
  const centavos = Math.round(total * 100);
  const base = Math.floor(centavos / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? centavos - base * (n - 1) : base) / 100);
}

/**
 * Uma conta repetida `vezes` meses seguidos, numerada "1/N", "2/N"...
 *
 * - `primeira`: para quem já pagou algumas — com 5 vezes e primeira = 2, cria
 *   só 2/5 a 5/5, e o vencimento informado é o da 2/5.
 * - `valorTotal`: o valor informado é o total da compra, não o da parcela.
 */
export function gerarRepeticoes(
  base: { nome: string; valor: number; vencimento: string; categoria: string; tipo: TipoConta },
  vezes: number,
  opcoes: { primeira?: number; valorTotal?: boolean } = {}
): Omit<Bill, "id">[] {
  const n = Math.max(1, Math.min(120, Math.floor(vezes)));
  const primeira = Math.max(1, Math.min(n, Math.floor(opcoes.primeira ?? 1)));
  const valores = opcoes.valorTotal ? dividirEmParcelas(base.valor, n) : new Array<number>(n).fill(base.valor);
  return Array.from({ length: n - primeira + 1 }, (_, k) => {
    const i = primeira - 1 + k;
    const vencimento = somarMeses(base.vencimento, k);
    return {
      name: base.nome,
      amount: valores[i],
      vencimento,
      dueDate: String(partes(vencimento).dia),
      category: base.categoria,
      tipo: base.tipo,
      parcela: n > 1 ? `${i + 1}/${n}` : undefined,
      paid: false,
    };
  });
}

/** As parcelas que vêm depois desta (mesmo nome, mesmo total de parcelas). */
export function proximasParcelas(conta: Bill, todas: Bill[]): Bill[] {
  const [atual, total] = (conta.parcela ?? "").split("/").map(Number);
  if (!atual || !total) return [];
  const nome = normalizar(conta.name);
  return todas.filter((c) => {
    if (c.id === conta.id || !c.parcela) return false;
    const [i, n] = c.parcela.split("/").map(Number);
    return n === total && i > atual && normalizar(c.name) === nome;
  });
}

// ----------------------------------------------
// Agrupamento por mês
// ----------------------------------------------

export interface GrupoMes {
  mes: string; // "2026-10"
  contas: { conta: Bill; vencimento: string }[];
  aPagar: number;
  pago: number;
}

export function agruparPorMes(contas: Bill[], hoje: string = dayKey()): GrupoMes[] {
  const grupos = new Map<string, GrupoMes>();
  for (const conta of contas) {
    const vencimento = vencimentoDe(conta, hoje);
    const mes = vencimento.slice(0, 7);
    const g = grupos.get(mes) ?? { mes, contas: [], aPagar: 0, pago: 0 };
    g.contas.push({ conta, vencimento });
    if (conta.paid) g.pago += conta.amount;
    else g.aPagar += conta.amount;
    grupos.set(mes, g);
  }
  return [...grupos.values()]
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map((g) => ({
      ...g,
      contas: g.contas.sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.conta.name.localeCompare(b.conta.name)),
    }));
}

// ----------------------------------------------
// Planilha (CSV)
// ----------------------------------------------

export interface LinhaPlanilha {
  linha: number;
  descricao: string;
  nome: string;
  parcela?: string;
  vencimento: string;
  valor: number;
  paga: boolean;
  categoria: string;
  tipo: TipoConta;
}

function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Divide uma linha de CSV respeitando aspas ("a;b" fica inteiro). */
function dividir(linha: string, separador: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (aspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else aspas = !aspas;
    } else if (c === separador && !aspas) {
      campos.push(atual.trim());
      atual = "";
    } else atual += c;
  }
  campos.push(atual.trim());
  return campos;
}

/** "25/09/2026", "25/09/26" ou "2026-09-25" -> "2026-09-25" */
export function lerData(texto: string): string | null {
  const t = texto.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return montar(Number(m[1]), Number(m[2]), Number(m[3]));
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > diasNoMes(ano, mes)) return null;
  return montar(ano, mes, dia);
}

function lerSituacao(texto: string): boolean {
  const t = normalizar(texto);
  if (!t || /a pagar|pendente|aberto|aberta|nao|vencer/.test(t)) return false;
  return /pag[ao]|quitad|^ok$|^sim$|^x$/.test(t);
}

/**
 * Lê a planilha de contas: Data; Descrição; Valor; Situação (a mesma ordem
 * da planilha "minhas-financas"). Aceita ; ou , como separador, com ou sem
 * cabeçalho, e parcelas no nome ("Internet - 1/12").
 */
export function lerPlanilha(texto: string): { linhas: LinhaPlanilha[]; erros: string[] } {
  const linhasBrutas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (linhasBrutas.length === 0) return { linhas: [], erros: ["A planilha está vazia."] };

  const primeira = linhasBrutas[0];
  const separador = (primeira.match(/;/g)?.length ?? 0) >= 1 ? ";" : primeira.includes("\t") ? "\t" : ",";

  // Acha as colunas pelo nome do cabeçalho; sem cabeçalho, usa a ordem padrão.
  let col = { data: 0, descricao: 1, valor: 2, situacao: 3 };
  let inicio = 0;
  const cab = dividir(primeira, separador).map(normalizar);
  if (cab.some((c) => /^(data|vencimento|descri|nome|conta|valor|situa|status)/.test(c))) {
    const achar = (re: RegExp, padrao: number) => {
      const i = cab.findIndex((c) => re.test(c));
      return i >= 0 ? i : padrao;
    };
    col = {
      data: achar(/^(data|vencimento|venc)/, 0),
      descricao: achar(/^(descri|nome|conta|item)/, 1),
      valor: achar(/^(valor|preco|total)/, 2),
      situacao: achar(/^(situa|status|pago|paga)/, 3),
    };
    inicio = 1;
  }

  const linhas: LinhaPlanilha[] = [];
  const erros: string[] = [];
  for (let i = inicio; i < linhasBrutas.length; i++) {
    const campos = dividir(linhasBrutas[i], separador);
    const numero = i + 1;
    const vencimento = lerData(campos[col.data] ?? "");
    const descricao = (campos[col.descricao] ?? "").trim();
    const valor = lerValor(campos[col.valor] ?? "");
    if (!vencimento || !descricao || !(valor > 0)) {
      erros.push(`Linha ${numero}: não deu para ler${!vencimento ? " a data" : !descricao ? " a descrição" : " o valor"}.`);
      continue;
    }
    const { nome, parcela } = separarParcela(descricao);
    const { categoria, tipo } = classificar(nome, parcela);
    linhas.push({
      linha: numero,
      descricao,
      nome,
      parcela,
      vencimento,
      valor: Math.round(valor * 100) / 100,
      paga: lerSituacao(campos[col.situacao] ?? ""),
      categoria,
      tipo,
    });
  }
  return { linhas, erros };
}

// ----------------------------------------------
// Importação sem duplicar
// ----------------------------------------------

function chave(nome: string, parcela: string | undefined, vencimento: string) {
  return `${normalizar(nome)}|${parcela ?? ""}|${vencimento}`;
}

export interface PlanoImportacao {
  novas: LinhaPlanilha[];
  /** Já existe, mas mudou valor ou situação: atualiza. */
  atualizar: { id: string; linha: LinhaPlanilha; mudancas: Partial<Bill> }[];
  /** Já existe igualzinha: nada a fazer. */
  iguais: LinhaPlanilha[];
}

/**
 * Compara a planilha com o que já está no app. A mesma conta (nome + parcela
 * + data) não entra duas vezes: reimportar a planilha do mês que vem só
 * acrescenta as novas e atualiza o que foi pago ou mudou de valor.
 */
export function planejarImportacao(linhas: LinhaPlanilha[], existentes: Bill[]): PlanoImportacao {
  const disponiveis = new Map<string, Bill[]>();
  for (const b of existentes) {
    if (!b.vencimento) continue; // contas antigas (só dia do mês) não entram na comparação
    const { nome, parcela } = b.parcela ? { nome: b.name, parcela: b.parcela } : separarParcela(b.name);
    const k = chave(nome, parcela, b.vencimento);
    disponiveis.set(k, [...(disponiveis.get(k) ?? []), b]);
  }

  const plano: PlanoImportacao = { novas: [], atualizar: [], iguais: [] };
  for (const linha of linhas) {
    const lista = disponiveis.get(chave(linha.nome, linha.parcela, linha.vencimento));
    const existente = lista?.shift();
    if (!existente) {
      plano.novas.push(linha);
      continue;
    }
    const mudancas: Partial<Bill> = {};
    if (Math.abs(existente.amount - linha.valor) > 0.004) mudancas.amount = linha.valor;
    // Só marca como paga (nunca "despaga" o que foi pago pelo app).
    if (linha.paga && !existente.paid) mudancas.paid = true;
    if (Object.keys(mudancas).length > 0) plano.atualizar.push({ id: existente.id, linha, mudancas });
    else plano.iguais.push(linha);
  }
  return plano;
}

/** Linha da planilha -> conta para gravar. */
export function contaDaLinha(linha: LinhaPlanilha): Omit<Bill, "id"> {
  return {
    name: linha.nome,
    amount: linha.valor,
    vencimento: linha.vencimento,
    dueDate: String(partes(linha.vencimento).dia),
    category: linha.categoria,
    tipo: linha.tipo,
    parcela: linha.parcela,
    paid: linha.paga,
  };
}
