import { describe, it, expect, vi } from "vitest";
import { lerComando, responder, MENSAGENS, type TelegramUpdate, type Io } from "./bot";

function privado(text?: string): TelegramUpdate {
  return {
    update_id: 1,
    message: { message_id: 10, chat: { id: 42, type: "private" }, ...(text !== undefined && { text }) },
  };
}

/** io de teste: nunca deveria ser chamada nos casos que não envolvem I/O nenhum. */
function ioFalso(): Io {
  return {
    vincular: vi.fn(async () => "nunca deveria chamar vincular aqui"),
    desvincular: vi.fn(async () => "nunca deveria chamar desvincular aqui"),
    registrar: vi.fn(async () => "nunca deveria chamar registrar aqui"),
    ultimas: vi.fn(async () => "nunca deveria chamar ultimas aqui"),
    desfazer: vi.fn(async () => "nunca deveria chamar desfazer aqui"),
    definirCartao: vi.fn(async () => "nunca deveria chamar definirCartao aqui"),
    cartoes: vi.fn(async () => "nunca deveria chamar cartoes aqui"),
  };
}

describe("lerComando", () => {
  it("separa comando e argumento", () => {
    expect(lerComando("/start abc123")).toEqual({ comando: "start", argumento: "abc123" });
  });

  it("tira o @NomeDoBot que vem do menu de comandos", () => {
    expect(lerComando("/ajuda@MinhaRotinaBot")).toEqual({ comando: "ajuda", argumento: "" });
  });

  it("ignora maiúsculas e espaços nas pontas", () => {
    expect(lerComando("  /AJUDA  ")).toEqual({ comando: "ajuda", argumento: "" });
  });

  it("não trata texto comum como comando", () => {
    expect(lerComando("gastei 25,90 mercado")).toBeNull();
  });

  it("uma barra sozinha não é comando", () => {
    expect(lerComando("/")).toBeNull();
  });
});

describe("responder — vínculo (Fase 2)", () => {
  it("/start sem código dá as boas-vindas, sem chamar o io", async () => {
    const io = ioFalso();
    await expect(responder(privado("/start"), io)).resolves.toEqual({ chatId: 42, texto: MENSAGENS.boasVindas });
    expect(io.vincular).not.toHaveBeenCalled();
  });

  it("/start com código chama io.vincular e devolve o texto dele", async () => {
    const io = ioFalso();
    io.vincular = vi.fn(async () => "vinculado!");
    const resposta = await responder(privado("/start CODIGO123"), io);
    expect(io.vincular).toHaveBeenCalledWith(42, "CODIGO123");
    expect(resposta).toEqual({ chatId: 42, texto: "vinculado!" });
  });

  it("/ajuda e /help mostram a ajuda", async () => {
    const io = ioFalso();
    expect((await responder(privado("/ajuda"), io))?.texto).toBe(MENSAGENS.ajuda);
    expect((await responder(privado("/help"), io))?.texto).toBe(MENSAGENS.ajuda);
    expect((await responder(privado("/ajuda@MinhaRotinaBot"), io))?.texto).toBe(MENSAGENS.ajuda);
  });

  it("/desvincular chama io.desvincular e devolve o texto dele", async () => {
    const io = ioFalso();
    io.desvincular = vi.fn(async () => "desvinculado!");
    const resposta = await responder(privado("/desvincular"), io);
    expect(io.desvincular).toHaveBeenCalledWith(42);
    expect(resposta).toEqual({ chatId: 42, texto: "desvinculado!" });
  });
});

describe("responder — texto livre vira lançamento (Fase 3)", () => {
  it("mensagem com valor identificável chama io.registrar com o update_id", async () => {
    const io = ioFalso();
    io.registrar = vi.fn(async () => "✅ registrado");
    const update = privado("gastei 25,90 no mercado");
    const resposta = await responder(update, io);
    expect(io.registrar).toHaveBeenCalledWith(42, update.update_id, {
      type: "expense",
      amount: 25.9,
      description: "Mercado",
    });
    expect(resposta).toEqual({ chatId: 42, texto: "✅ registrado" });
  });

  it("uber 18 — sem verbo, ainda assim registra como gasto", async () => {
    const io = ioFalso();
    io.registrar = vi.fn(async () => "✅ registrado");
    await responder(privado("uber 18"), io);
    expect(io.registrar).toHaveBeenCalledWith(
      42,
      1,
      expect.objectContaining({ type: "expense", amount: 18, description: "Uber" })
    );
  });

  it("recebi 2500 de salário — vira receita", async () => {
    const io = ioFalso();
    io.registrar = vi.fn(async () => "✅ registrado");
    await responder(privado("recebi 2500 de salário"), io);
    expect(io.registrar).toHaveBeenCalledWith(
      42,
      1,
      expect.objectContaining({ type: "income", amount: 2500, description: "Salário" })
    );
  });

  it("mensagem sem valor identificável não chama o io, pede pra reformular", async () => {
    const io = ioFalso();
    const resposta = await responder(privado("almoço no shopping"), io);
    expect(io.registrar).not.toHaveBeenCalled();
    expect(resposta?.texto).toBe(MENSAGENS.naoEntendi);
  });

  it("mensagem ambígua (só o valor, sem descrição) não chama o io", async () => {
    const io = ioFalso();
    const resposta = await responder(privado("30"), io);
    expect(io.registrar).not.toHaveBeenCalled();
    expect(resposta?.texto).toBe(MENSAGENS.naoEntendi);
  });
});

describe("responder — comandos /gasto, /entrada, /ultimas, /desfazer (Fase 3)", () => {
  it("/gasto 30 mercado chama io.registrar como despesa", async () => {
    const io = ioFalso();
    io.registrar = vi.fn(async () => "✅ gasto ok");
    const resposta = await responder(privado("/gasto 30 mercado"), io);
    expect(io.registrar).toHaveBeenCalledWith(42, 1, { type: "expense", amount: 30, description: "Mercado" });
    expect(resposta).toEqual({ chatId: 42, texto: "✅ gasto ok" });
  });

  it("/entrada 2500 salário chama io.registrar como receita", async () => {
    const io = ioFalso();
    io.registrar = vi.fn(async () => "✅ entrada ok");
    await responder(privado("/entrada 2500 salário"), io);
    expect(io.registrar).toHaveBeenCalledWith(42, 1, { type: "income", amount: 2500, description: "Salário" });
  });

  it("/gasto sem valor reconhecível não chama o io", async () => {
    const io = ioFalso();
    const resposta = await responder(privado("/gasto mercado"), io);
    expect(io.registrar).not.toHaveBeenCalled();
    expect(resposta?.texto).toBe(MENSAGENS.naoEntendi);
  });

  it("/ultimas chama io.ultimas", async () => {
    const io = ioFalso();
    io.ultimas = vi.fn(async () => "lista de transações");
    const resposta = await responder(privado("/ultimas"), io);
    expect(io.ultimas).toHaveBeenCalledWith(42);
    expect(resposta).toEqual({ chatId: 42, texto: "lista de transações" });
  });

  it("/desfazer chama io.desfazer", async () => {
    const io = ioFalso();
    io.desfazer = vi.fn(async () => "desfeito");
    const resposta = await responder(privado("/desfazer"), io);
    expect(io.desfazer).toHaveBeenCalledWith(42);
    expect(resposta).toEqual({ chatId: 42, texto: "desfeito" });
  });
});

describe("responder — casos gerais", () => {
  it("comando que não existe avisa e aponta para a ajuda", async () => {
    const io = ioFalso();
    expect((await responder(privado("/rota-inexistente 10 x"), io))?.texto).toBe(MENSAGENS.comandoDesconhecido);
  });

  it("mensagem sem texto (áudio, foto) avisa que só entende texto", async () => {
    const io = ioFalso();
    expect((await responder(privado(undefined), io))?.texto).toBe(MENSAGENS.soTexto);
  });

  it("fica quieto em grupo, sem chamar o io", async () => {
    const io = ioFalso();
    const grupo: TelegramUpdate = {
      update_id: 2,
      message: { message_id: 11, chat: { id: -100, type: "group" }, text: "gastei 30 no mercado" },
    };
    await expect(responder(grupo, io)).resolves.toBeNull();
    expect(io.registrar).not.toHaveBeenCalled();
    expect(io.vincular).not.toHaveBeenCalled();
    expect(io.desvincular).not.toHaveBeenCalled();
  });

  it("ignora updates sem mensagem", async () => {
    const io = ioFalso();
    await expect(responder({ update_id: 3 }, io)).resolves.toBeNull();
  });
});

describe("responder — cartões de crédito", () => {
  it("/cartoes lista os cartões", async () => {
    const io = ioFalso();
    io.cartoes = vi.fn(async () => "Nubank · Paloma");
    const resposta = await responder(privado("/cartoes"), io);
    expect(io.cartoes).toHaveBeenCalledWith(42);
    expect(resposta).toEqual({ chatId: 42, texto: "Nubank · Paloma" });
  });

  it("/cartao com o nome manda o último gasto pra esse cartão", async () => {
    const io = ioFalso();
    io.definirCartao = vi.fn(async () => "foi pro Nubank");
    const resposta = await responder(privado("/cartao neuza nubank"), io);
    expect(io.definirCartao).toHaveBeenCalledWith(42, "neuza nubank");
    expect(resposta).toEqual({ chatId: 42, texto: "foi pro Nubank" });
  });

  it("/cartao sem dizer qual pergunta, em vez de chutar", async () => {
    const io = ioFalso();
    expect((await responder(privado("/cartao"), io))?.texto).toBe(MENSAGENS.qualCartao);
    expect(io.definirCartao).not.toHaveBeenCalled();
  });

  it("o cartão no texto livre não vira comando: continua lançamento", async () => {
    const io = ioFalso();
    io.registrar = vi.fn(async () => "registrado");
    await responder(privado("gastei 50 de gasolina no cartão neuza nubank"), io);
    expect(io.registrar).toHaveBeenCalledWith(42, 1, {
      type: "expense",
      amount: 50,
      // Quem tira as palavras do cartão da descrição é transacoes.ts, que sabe
      // quais cartões existem; o parser só entrega o texto sem o valor.
      description: "Gasolina cartão neuza nubank",
    });
  });
});
