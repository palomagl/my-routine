// ==============================================
// Transações criadas pelo bot do Telegram
// ==============================================
// Só chega aqui quem já provou, por telegramChats/{chatId}, que fala em nome
// de um uid — nenhuma função aqui confia em texto vindo do Telegram sozinho.
// A interpretação do texto (parser.ts) já aconteceu antes; aqui só decide
// onde e como gravar.

import { createHash } from "node:crypto";
import { Timestamp, getFirestore } from "firebase-admin/firestore";
import { obterAppAdmin } from "../firebase-admin.js";
import { obterUidPorChat } from "./vinculo.js";
import type { TransacaoInterpretada } from "./parser.js";
// As regras de cartão e o palpite de categoria são os mesmos do app — um
// arquivo só, para o bot e a tela nunca discordarem.
import { acharCartaoNoTexto, nomeCompleto, type Cartao } from "../../../src/lib/cartoes.js";
import { sugerirCategoria } from "../../../src/lib/categorias.js";

function db() {
  return getFirestore(obterAppAdmin());
}

/** "YYYY-MM-DD" em America/Sao_Paulo — o mesmo formato de transactions.date usado pelo app. */
export function dataHojeSaoPaulo(agora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);

  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${parte("year")}-${parte("month")}-${parte("day")}`;
}

/**
 * ID determinístico a partir do update_id do Telegram: se o Telegram reenviar
 * o mesmo update (timeout, falha de rede), a segunda tentativa cai no mesmo
 * documento em vez de criar um lançamento duplicado.
 */
export function idDaTransacao(updateId: number): string {
  return "tg_" + createHash("sha256").update(String(updateId)).digest("hex").slice(0, 24);
}

function formatarReais(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const NAO_VINCULADO =
  "Essa conta ainda não está vinculada. Abra o app, vá em Minha conta, gere um código e manda /start CODIGO aqui.";

/** Resolve o uid do chat antes de tocar em qualquer transação; sem vínculo, nem tenta. */
async function comUid(chatId: number, acao: (uid: string) => Promise<string>): Promise<string> {
  const uid = await obterUidPorChat(chatId);
  if (!uid) return NAO_VINCULADO;
  return acao(uid);
}

/** Os cartões de crédito cadastrados por ela no app. */
async function lerCartoes(uid: string): Promise<Cartao[]> {
  const snap = await db().collection("users").doc(uid).collection("cards").get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Cartao, "id">) }));
}

/** Chamada pelo webhook pra /gasto, /entrada e texto livre já interpretado. */
export async function registrarTransacao(
  chatId: number,
  updateId: number,
  transacao: TransacaoInterpretada
): Promise<string> {
  return comUid(chatId, async (uid) => {
    const ref = db().collection("users").doc(uid).collection("transactions").doc(idDaTransacao(updateId));
    const existente = await ref.get();

    // "gasolina cartão neuza nubank" -> cartão da Neuza do Nubank e descrição
    // "gasolina". Com dois cartões da Neuza e só "neuza" escrito, registra sem
    // cartão e pergunta qual é — melhor do que chutar.
    const cartoes = await lerCartoes(uid);
    const achado = acharCartaoNoTexto(transacao.description, cartoes);
    const description = achado.textoLimpo || transacao.description;
    const cartao = transacao.type === "expense" ? achado.cartao : null;

    if (!existente.exists) {
      await ref.set({
        description,
        amount: transacao.amount,
        type: transacao.type,
        date: dataHojeSaoPaulo(),
        // "Netflix" já entra em Assinaturas, "gasolina" em Transporte — o
        // mesmo palpite que o formulário do app usa.
        category: sugerirCategoria(description) ?? "Outros",
        ...(cartao ? { cardId: cartao.id } : {}),
        source: "telegram",
        telegramChatId: String(chatId),
        createdAt: Timestamp.now(),
      });
    }

    const rotulo = transacao.type === "income" ? "Entrada" : "Gasto";
    const emoji = transacao.type === "income" ? "💰" : "💸";
    const onde = cartao ? ` no ${nomeCompleto(cartao)}` : "";
    const confirmacao = `${emoji} ${rotulo} de ${formatarReais(transacao.amount)} em ${description}${onde} registrado(a).`;

    if (achado.ambiguos.length > 1) {
      const opcoes = achado.ambiguos.map((c) => `/cartao ${c.banco}`).join(" ou ");
      return [confirmacao, "", `Tenho mais de um cartão com esse nome. Qual foi? Responde ${opcoes}.`].join("\n");
    }
    return `${confirmacao} Já aparece nas suas Finanças.`;
  });
}

/** Chamada pelo webhook em /cartao: diz em qual cartão foi o último gasto. */
export async function definirCartaoDaUltima(chatId: number, texto: string): Promise<string> {
  return comUid(chatId, async (uid) => {
    const cartoes = await lerCartoes(uid);
    if (cartoes.length === 0) return "Você ainda não cadastrou nenhum cartão no app.";

    const achado = acharCartaoNoTexto(texto, cartoes);
    if (achado.ambiguos.length > 1) {
      return `Tenho mais de um cartão assim: ${achado.ambiguos.map((c) => nomeCompleto(c)).join(", ")}. Diz o banco junto.`;
    }
    if (!achado.cartao) {
      return `Não achei esse cartão. Os seus são: ${cartoes.map((c) => nomeCompleto(c)).join(", ")}.`;
    }

    const doTelegram = await ultimaDoChat(uid, chatId);
    if (!doTelegram) return "Não achei nenhum gasto recente registrado por aqui.";

    await doTelegram.ref.update({ cardId: achado.cartao.id });
    const t = doTelegram.data() as { amount: number; description: string };
    return `💳 ${formatarReais(t.amount)} em ${t.description} foi pro ${nomeCompleto(achado.cartao)}.`;
  });
}

/** Chamada pelo webhook em /cartoes. */
export async function listarCartoes(chatId: number): Promise<string> {
  return comUid(chatId, async (uid) => {
    const cartoes = await lerCartoes(uid);
    if (cartoes.length === 0) return "Você ainda não cadastrou nenhum cartão. Dá pra criar nas Finanças, em Cartões.";
    const linhas = cartoes.map((c) => `• ${nomeCompleto(c)} — fecha dia ${c.fechamento}, vence dia ${c.vencimento}`);
    return ["💳 Seus cartões:", "", ...linhas, "", 'Pra usar: "gastei 50 de gasolina no cartão neuza nubank".'].join("\n");
  });
}

/** Chamada pelo webhook em /ultimas. */
export async function listarUltimas(chatId: number, limite = 5): Promise<string> {
  return comUid(chatId, async (uid) => {
    const snap = await db()
      .collection("users")
      .doc(uid)
      .collection("transactions")
      .orderBy("createdAt", "desc")
      .limit(limite)
      .get();

    if (snap.empty) return "Você ainda não tem nenhuma transação registrada.";

    const linhas = snap.docs.map((doc) => {
      const t = doc.data() as { type: string; amount: number; description: string };
      const sinal = t.type === "income" ? "+" : "-";
      return `${sinal} ${formatarReais(t.amount)} — ${t.description}`;
    });

    return ["📋 Últimas transações:", "", ...linhas].join("\n");
  });
}

/**
 * A última transação que ESTE chat registrou.
 *
 * Sem índice composto: busca as últimas N por createdAt (índice padrão de
 * campo único, sempre existe) e filtra por chat na memória. N=20 cobre
 * qualquer sequência realista de uso misto entre app e bot.
 */
async function ultimaDoChat(uid: string, chatId: number) {
  const snap = await db()
    .collection("users")
    .doc(uid)
    .collection("transactions")
    .orderBy("createdAt", "desc")
    .limit(20)
    .get();

  return snap.docs.find((doc) => {
    const t = doc.data() as { source?: string; telegramChatId?: string };
    return t.source === "telegram" && t.telegramChatId === String(chatId);
  });
}

/** Chamada pelo webhook em /desfazer. Só apaga a última transação criada por ESTE chat. */
export async function desfazerUltima(chatId: number): Promise<string> {
  return comUid(chatId, async (uid) => {
    const doTelegram = await ultimaDoChat(uid, chatId);

    if (!doTelegram) {
      return "Não achei nenhuma transação recente registrada por aqui pra desfazer.";
    }

    const t = doTelegram.data() as { type: string; amount: number; description: string };
    await doTelegram.ref.delete();

    const rotulo = t.type === "income" ? "entrada" : "gasto";
    return `✅ Desfeito: ${rotulo} de ${formatarReais(t.amount)} em ${t.description}.`;
  });
}
