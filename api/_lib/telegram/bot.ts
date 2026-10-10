// ==============================================
// Bot do Telegram: o que responder
// ==============================================
// Recebe o update que o Telegram mandou e devolve a resposta (ou nada). Não
// faz rede nem lê variável de ambiente diretamente — quem faz isso é o `io`
// que a chamadora injeta, o que deixa dar para testar sem bot, sem token e
// sem Firestore de verdade. Quem envia a resposta e quem monta o `io` de
// produção é o webhook.
//
// A interpretação de texto livre e dos comandos /gasto e /entrada (valor,
// tipo, descrição) é feita pelo parser.ts, também puro — este arquivo só
// decide QUAL comando é e, se precisar gravar algo, chama o `io`.
//
// A pasta começa com "_" de propósito: a Vercel não transforma o que está em
// api/_lib em endpoint público.

import { interpretarComando, interpretarMensagem, type TransacaoInterpretada } from "./parser.js";

/** Só o pedaço do update que o bot usa. O Telegram manda muito mais. */
export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    text?: string;
  };
}

export interface Resposta {
  chatId: number;
  texto: string;
}

/**
 * O que os comandos precisam fazer além de responder — todos leem e/ou
 * escrevem no Firestore. Injetado para o bot.ts continuar puro e testável
 * sem depender do Admin SDK.
 */
export interface Io {
  vincular: (chatId: number, codigo: string) => Promise<string>;
  desvincular: (chatId: number) => Promise<string>;
  registrar: (chatId: number, updateId: number, transacao: TransacaoInterpretada) => Promise<string>;
  ultimas: (chatId: number) => Promise<string>;
  desfazer: (chatId: number) => Promise<string>;
  /** /cartao — diz em qual cartão foi o último gasto. */
  definirCartao: (chatId: number, texto: string) => Promise<string>;
  /** /cartoes — lista os cartões cadastrados. */
  cartoes: (chatId: number) => Promise<string>;
}

export const MENSAGENS = {
  boasVindas: [
    "Olá! 👋 Eu sou o bot do Minha Rotina.",
    "",
    "Registre gastos e entradas mandando uma mensagem aqui, e eles aparecem direto nas suas Finanças.",
    "",
    "Veja como em /ajuda.",
  ].join("\n"),

  ajuda: [
    "📋 Comandos disponíveis",
    "",
    "Registrar por texto — em qualquer ordem, à vontade:",
    "• gastei 30 reais no mercado",
    "• recebi 2500 de salário",
    "• uber 18",
    "",
    "No crédito, é só dizer o cartão:",
    "• gastei 50 de gasolina no cartão neuza nubank",
    "• netflix 45 cartão paloma",
    "",
    "Ou por comando:",
    "/gasto 30 mercado",
    "/entrada 2500 salário",
    "",
    "/cartoes – seus cartões cadastrados",
    "/cartao nubank – põe o último gasto nesse cartão",
    "/ultimas – suas últimas transações",
    "/desfazer – apaga a última transação registrada por aqui",
    "/desvincular – desfaz o vínculo desta conta com o Telegram",
    "/ajuda – esta lista",
  ].join("\n"),

  naoEntendi:
    "Não consegui identificar um valor nessa mensagem. Tenta assim: \"gastei 30 no mercado\" ou /gasto 30 mercado.",

  comandoDesconhecido: "Não conheço esse comando. Veja os disponíveis em /ajuda.",

  qualCartao: "Diz qual cartão, assim: /cartao nubank. Pra ver os seus, /cartoes.",

  soTexto: "Por enquanto eu só entendo mensagens de texto.",
} as const;

/**
 * Separa "/start@MinhaRotinaBot abc" em comando "start" e argumento "abc".
 * Devolve null quando o texto não é um comando.
 *
 * O "@NomeDoBot" aparece quando alguém toca num comando do menu; tirar ele
 * aqui evita que "/ajuda@Bot" caia em "comando desconhecido".
 */
export function lerComando(texto: string): { comando: string; argumento: string } | null {
  const limpo = texto.trim();
  if (!limpo.startsWith("/")) return null;

  const [primeira, ...resto] = limpo.split(/\s+/);
  const comando = primeira.slice(1).split("@")[0].toLowerCase();
  if (!comando) return null;

  return { comando, argumento: resto.join(" ") };
}

export async function responder(update: TelegramUpdate, io: Io): Promise<Resposta | null> {
  const mensagem = update.message;
  if (!mensagem) return null;

  // Finanças são pessoais: o bot só conversa no privado. Em grupo ele fica
  // quieto, para não expor nada nem responder a mensagens de outras pessoas.
  if (mensagem.chat.type !== "private") return null;

  const chatId = mensagem.chat.id;
  const texto = mensagem.text;

  if (texto === undefined) return { chatId, texto: MENSAGENS.soTexto };

  const cmd = lerComando(texto);

  // Não é comando: tenta interpretar como lançamento livre ("uber 18").
  if (!cmd) {
    const transacao = interpretarMensagem(texto);
    if (!transacao) return { chatId, texto: MENSAGENS.naoEntendi };
    return { chatId, texto: await io.registrar(chatId, update.update_id, transacao) };
  }

  switch (cmd.comando) {
    case "start":
      // t.me/bot?start=CODIGO chega aqui como "/start CODIGO": é o vínculo
      // da Fase 2. Sem argumento, é só a apresentação de sempre.
      if (cmd.argumento) {
        return { chatId, texto: await io.vincular(chatId, cmd.argumento) };
      }
      return { chatId, texto: MENSAGENS.boasVindas };
    case "ajuda":
    case "help":
      return { chatId, texto: MENSAGENS.ajuda };
    case "desvincular":
      return { chatId, texto: await io.desvincular(chatId) };
    case "gasto": {
      const transacao = interpretarComando("expense", cmd.argumento);
      if (!transacao) return { chatId, texto: MENSAGENS.naoEntendi };
      return { chatId, texto: await io.registrar(chatId, update.update_id, transacao) };
    }
    case "entrada": {
      const transacao = interpretarComando("income", cmd.argumento);
      if (!transacao) return { chatId, texto: MENSAGENS.naoEntendi };
      return { chatId, texto: await io.registrar(chatId, update.update_id, transacao) };
    }
    case "cartoes":
    case "cartões":
      return { chatId, texto: await io.cartoes(chatId) };
    case "cartao":
    case "cartão": {
      if (!cmd.argumento.trim()) return { chatId, texto: MENSAGENS.qualCartao };
      return { chatId, texto: await io.definirCartao(chatId, cmd.argumento) };
    }
    case "ultimas":
      return { chatId, texto: await io.ultimas(chatId) };
    case "desfazer":
      return { chatId, texto: await io.desfazer(chatId) };
    default:
      return { chatId, texto: MENSAGENS.comandoDesconhecido };
  }
}
