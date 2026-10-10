import { describe, it, expect } from "vitest";
import {
  acharCartaoNoTexto,
  comprasDaFatura,
  faturaDaCompra,
  faturasEmAberto,
  nomeDaFatura,
  totalDaFatura,
  vencimentoDaFatura,
  type Cartao,
} from "./cartoes";

const paloma: Cartao = { id: "p", nome: "Paloma", banco: "nubank", fechamento: 20, vencimento: 27 };
const neuzaNu: Cartao = { id: "n1", nome: "Neuza", banco: "nubank", fechamento: 20, vencimento: 27 };
const neuzaSan: Cartao = { id: "n2", nome: "Neuza", banco: "santander", fechamento: 10, vencimento: 17 };

describe("fatura da compra", () => {
  it("entra na fatura do mês quando compra antes do fechamento", () => {
    expect(faturaDaCompra("2026-10-09", 20)).toBe("2026-10");
    expect(faturaDaCompra("2026-10-20", 20)).toBe("2026-10");
  });

  it("joga para o mês seguinte quando compra depois do fechamento", () => {
    expect(faturaDaCompra("2026-10-21", 20)).toBe("2026-11");
    expect(faturaDaCompra("2026-12-28", 20)).toBe("2027-01");
  });

  it("encurta o vencimento que não cabe no mês", () => {
    expect(vencimentoDaFatura("2026-02", { fechamento: 20, vencimento: 31 })).toBe("2026-02-28");
    expect(vencimentoDaFatura("2026-10", { fechamento: 20, vencimento: 27 })).toBe("2026-10-27");
  });

  it("vencimento antes do fechamento cai no mês seguinte (fecha 28, vence 5)", () => {
    expect(vencimentoDaFatura("2026-10", { fechamento: 28, vencimento: 5 })).toBe("2026-11-05");
    expect(vencimentoDaFatura("2026-12", { fechamento: 28, vencimento: 5 })).toBe("2027-01-05");
  });
});

describe("total da fatura", () => {
  const compras = [
    { amount: 50, type: "expense" as const, date: "2026-10-09", cardId: "n1" },
    { amount: 30, type: "expense" as const, date: "2026-10-21", cardId: "n1" }, // já é a próxima
    { amount: 10, type: "income" as const, date: "2026-10-10", cardId: "n1" }, // estorno
    { amount: 99, type: "expense" as const, date: "2026-10-09", cardId: "p" },
    { amount: 25, type: "expense" as const, date: "2026-10-09" }, // dinheiro, sem cartão
  ];

  it("soma só as compras daquele cartão naquela fatura, descontando estorno", () => {
    expect(totalDaFatura(compras, neuzaNu, "2026-10")).toBe(40);
    expect(totalDaFatura(compras, neuzaNu, "2026-11")).toBe(30);
    expect(totalDaFatura(compras, paloma, "2026-10")).toBe(99);
  });

  it("lista as compras da fatura da mais nova para a mais velha", () => {
    expect(comprasDaFatura(compras, neuzaNu, "2026-10").map((c) => c.amount)).toEqual([10, 50]);
  });

  it("nomeia a fatura do jeito que a conta a pagar mostra", () => {
    expect(nomeDaFatura(neuzaSan, "2026-10")).toBe("Fatura Santander · Neuza · 10/2026");
  });
});

describe("faturas em aberto viram contas a pagar", () => {
  const compras = [
    { amount: 50, type: "expense" as const, date: "2026-10-09", cardId: "n1" },
    { amount: 99, type: "expense" as const, date: "2026-10-05", cardId: "p" },
  ];

  it("mostra uma conta por fatura com valor, na ordem do vencimento", () => {
    const faturas = faturasEmAberto([paloma, neuzaNu, neuzaSan], compras, () => false, "2026-10-10");
    expect(faturas.map((f) => [f.name, f.amount, f.vencimento])).toEqual([
      ["Fatura Nubank · Paloma · 10/2026", 99, "2026-10-27"],
      ["Fatura Nubank · Neuza · 10/2026", 50, "2026-10-27"],
    ]);
  });

  it("some quando a fatura já foi marcada como paga", () => {
    const paga = (nome: string) => nome === "Fatura Nubank · Paloma · 10/2026";
    const faturas = faturasEmAberto([paloma, neuzaNu], compras, paga, "2026-10-10");
    expect(faturas.map((f) => f.name)).toEqual(["Fatura Nubank · Neuza · 10/2026"]);
  });

  it("cartão sem compra nenhuma não vira conta a pagar", () => {
    expect(faturasEmAberto([neuzaSan], compras, () => false, "2026-10-10")).toEqual([]);
  });
});

describe("achar o cartão no texto", () => {
  const todos = [paloma, neuzaNu, neuzaSan];

  it("acha pelo nome e pelo banco juntos", () => {
    const r = acharCartaoNoTexto("gastei 50 de gasolina no cartão neuza nubank", todos);
    expect(r.cartao).toBe(neuzaNu);
    expect(r.textoLimpo).toBe("gastei 50 de gasolina no");
  });

  it("acha pelo nome quando só existe um daquele nome", () => {
    expect(acharCartaoNoTexto("netflix 45 cartao paloma", todos).cartao).toBe(paloma);
  });

  it("devolve os dois quando o nome serve para mais de um", () => {
    const r = acharCartaoNoTexto("mercado 80 no cartão neuza", todos);
    expect(r.cartao).toBeNull();
    expect(r.ambiguos).toEqual([neuzaNu, neuzaSan]);
    expect(r.mencionouCartao).toBe(true);
  });

  it("acha só pelo banco quando o banco é de um cartão só", () => {
    expect(acharCartaoNoTexto("tenis 300 santander", todos).cartao).toBe(neuzaSan);
  });

  it("não inventa cartão quando ninguém falou em cartão", () => {
    const r = acharCartaoNoTexto("gastei 20 no mercado", todos);
    expect(r.cartao).toBeNull();
    expect(r.ambiguos).toEqual([]);
    expect(r.mencionouCartao).toBe(false);
    expect(r.textoLimpo).toBe("gastei 20 no mercado");
  });
});
