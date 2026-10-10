// ==============================================
// POST /api/telegram/webhook
// ==============================================
// O Telegram chama este endereço a cada mensagem enviada ao bot.
//
// Tudo acontece ANTES de responder o HTTP: interpretar, ler/escrever o
// Firestore quando o comando precisa (vínculo, desvínculo, transações),
// enviar a resposta no chat e só então devolver 200. Nada fica rodando
// depois da resposta — numa função serverless isso não é garantido, e o
// trabalho poderia ser cortado no meio.
//
// Sobre o status devolvido: qualquer coisa diferente de 2xx faz o Telegram
// reenviar o mesmo update depois. Por isso, se a mensagem de resposta falhar,
// o webhook ainda devolve 200: reenviar não conserta um token errado, e uma
// resposta perdida não estraga nenhum dado. Quem registra transação (Fase 3)
// usa um ID determinístico a partir do update_id, então um reenvio de
// verdade também não duplica lançamento.

import { responder, type Io, type TelegramUpdate } from "../_lib/telegram/bot.js";
import { enviarMensagem } from "../_lib/telegram/cliente.js";
import { CABECALHO_SEGREDO, segredoValido } from "../_lib/telegram/seguranca.js";
import { desvincularPorChat, vincularPorCodigo } from "../_lib/telegram/vinculo.js";
import {
  definirCartaoDaUltima,
  desfazerUltima,
  listarCartoes,
  listarUltimas,
  registrarTransacao,
} from "../_lib/telegram/transacoes.js";

const io: Io = {
  vincular: vincularPorCodigo,
  desvincular: desvincularPorChat,
  registrar: registrarTransacao,
  ultimas: listarUltimas,
  desfazer: desfazerUltima,
  definirCartao: definirCartaoDaUltima,
  cartoes: listarCartoes,
};

export async function POST(request: Request): Promise<Response> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const segredo = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!token || !segredo) {
    console.error("[telegram] TELEGRAM_BOT_TOKEN ou TELEGRAM_WEBHOOK_SECRET não configurados.");
    return new Response("Configuração incompleta", { status: 500 });
  }

  if (!segredoValido(request.headers.get(CABECALHO_SEGREDO), segredo)) {
    return new Response("Não autorizado", { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }

  let resposta: Awaited<ReturnType<typeof responder>>;
  try {
    resposta = await responder(update, io);
  } catch (erro) {
    // Uma falha no Firestore (vincular/desvincular/registrar) não pode
    // derrubar o webhook: o Telegram reenviaria o mesmo update, e o problema
    // continuaria o mesmo. A pessoa só fica sem resposta desta vez.
    console.error("[telegram] falha ao processar update:", erro);
    resposta = null;
  }

  // O texto da mensagem não vai para o log: vai ter valores e gastos.
  console.info(
    `[telegram] update ${update?.update_id} · chat ${update?.message?.chat?.type ?? "-"} · ` +
      (resposta ? "respondido" : "ignorado")
  );

  if (resposta) {
    await enviarMensagem(token, resposta.chatId, resposta.texto);
  }

  return new Response("ok", { status: 200 });
}
