import { describe, it, expect } from "vitest";
import type { Bill } from "@/lib/db";
import {
  agruparPorMes,
  classificar,
  dividirEmParcelas,
  gerarRepeticoes,
  proximasParcelas,
  lerData,
  lerPlanilha,
  planejarImportacao,
  contaDaLinha,
  separarParcela,
  situacaoDe,
  somarMeses,
  vencimentoDe,
} from "./contas";

// O começo da planilha de verdade (com BOM e CRLF, como o Excel salva).
const PLANILHA =
  "﻿Data;Descrição;Valor;Situação\r\n" +
  "10/09/2026;Mercado livre;60,00;Paga\r\n" +
  "20/09/2026;Card vó;1100,00;Paga\r\n" +
  "25/09/2026;Internet - 1/12;120,00;A pagar\r\n" +
  "05/10/2026;Loja carne;57,49;A pagar\r\n" +
  "10/10/2026;Gang - 1/3;60,00;A pagar\r\n" +
  "10/10/2026;Faculdade - 1/3;155,00;A pagar\r\n" +
  "15/10/2026;Cartão Paloma;50,00;A pagar\r\n" +
  "24/09/2026;Claude;110,00;Paga\r\n";

function conta(over: Partial<Bill>): Bill {
  return { id: "c", name: "x", amount: 10, dueDate: "10", category: "Outros", paid: false, ...over };
}

describe("datas", () => {
  it("soma meses encostando no fim do mês", () => {
    expect(somarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(somarMeses("2026-09-25", 4)).toBe("2027-01-25");
  });

  it("lê datas brasileiras e ISO", () => {
    expect(lerData("05/10/2026")).toBe("2026-10-05");
    expect(lerData("5/1/27")).toBe("2027-01-05");
    expect(lerData("2026-12-10")).toBe("2026-12-10");
    expect(lerData("31/02/2026")).toBeNull();
  });

  it("conta antiga (só o dia) vence no mês atual", () => {
    expect(vencimentoDe(conta({ dueDate: "31" }), "2026-09-25")).toBe("2026-09-30");
  });

  it("diz se venceu, vence hoje ou falta pouco", () => {
    const hoje = "2026-09-25";
    expect(situacaoDe(conta({ vencimento: "2026-09-24" }), hoje).situacao).toBe("vencida");
    expect(situacaoDe(conta({ vencimento: "2026-09-25" }), hoje).situacao).toBe("hoje");
    expect(situacaoDe(conta({ vencimento: "2026-09-30" }), hoje)).toEqual({ situacao: "semana", dias: 5 });
    expect(situacaoDe(conta({ vencimento: "2026-09-20", paid: true }), hoje).situacao).toBe("paga");
  });
});

describe("nome, parcela e tipo", () => {
  it("separa a parcela do nome", () => {
    expect(separarParcela("Internet - 1/12")).toEqual({ nome: "Internet", parcela: "1/12" });
    expect(separarParcela("Gang 2/3")).toEqual({ nome: "Gang", parcela: "2/3" });
    expect(separarParcela("Loja 24/7")).toEqual({ nome: "Loja 24/7" });
  });

  it("internet numerada continua sendo conta fixa", () => {
    expect(classificar("Internet", "1/12")).toEqual({ categoria: "Serviços", tipo: "fixa" });
  });

  it("cartão, compra parcelada e faculdade", () => {
    expect(classificar("Card vó").tipo).toBe("cartao");
    expect(classificar("Cartão Paloma").categoria).toBe("Cartão");
    expect(classificar("Gang", "1/3")).toEqual({ categoria: "Compras", tipo: "parcela" });
    expect(classificar("Faculdade", "1/3")).toEqual({ categoria: "Estudos", tipo: "fixa" });
    expect(classificar("New Laptop")).toEqual({ categoria: "Estudos", tipo: "avulsa" });
    expect(classificar("Claude")).toEqual({ categoria: "Estudos", tipo: "fixa" });
  });
});

describe("planilha", () => {
  it("lê todas as linhas com data, valor e situação", () => {
    const { linhas, erros } = lerPlanilha(PLANILHA);
    expect(erros).toEqual([]);
    expect(linhas.length).toBe(8);
    const internet = linhas.find((l) => l.nome === "Internet")!;
    expect(internet.vencimento).toBe("2026-09-25");
    expect(internet.valor).toBe(120);
    expect(internet.parcela).toBe("1/12");
    expect(internet.paga).toBe(false);
    expect(linhas.find((l) => l.nome === "Card vó")!.valor).toBe(1100);
    expect(linhas.find((l) => l.nome === "Loja carne")!.valor).toBeCloseTo(57.49);
    expect(linhas.find((l) => l.nome === "Mercado livre")!.paga).toBe(true);
  });

  it("aponta a linha que não deu para ler", () => {
    const { linhas, erros } = lerPlanilha("Data;Descrição;Valor;Situação\n40/13/2026;Luz;50;A pagar\n");
    expect(linhas.length).toBe(0);
    expect(erros.length).toBe(1);
  });

  it("reimportar não duplica e só atualiza o que mudou", () => {
    const { linhas } = lerPlanilha(PLANILHA);
    const jaNoApp: Bill[] = linhas.map((l, i) => ({ id: `b${i}`, ...contaDaLinha(l) }));
    // No mês seguinte: internet foi paga e a loja mudou de valor.
    const atualizada = PLANILHA.replace("Internet - 1/12;120,00;A pagar", "Internet - 1/12;120,00;Paga")
      .replace("Loja carne;57,49", "Loja carne;60,00") + "25/10/2026;Internet - 2/12;120,00;A pagar\r\n";
    const plano = planejarImportacao(lerPlanilha(atualizada).linhas, jaNoApp);
    expect(plano.novas.map((l) => l.descricao)).toEqual(["Internet - 2/12"]);
    expect(plano.atualizar.length).toBe(2);
    expect(plano.atualizar.find((a) => a.linha.nome === "Internet")!.mudancas).toEqual({ paid: true });
    expect(plano.atualizar.find((a) => a.linha.nome === "Loja carne")!.mudancas).toEqual({ amount: 60 });
    expect(plano.iguais.length).toBe(6);
  });
});

describe("repetições e meses", () => {
  it("gera parcelas mês a mês numeradas", () => {
    const r = gerarRepeticoes({ nome: "Gang", valor: 60, vencimento: "2026-10-10", categoria: "Compras", tipo: "parcela" }, 3);
    expect(r.map((x) => [x.vencimento, x.parcela, x.dueDate])).toEqual([
      ["2026-10-10", "1/3", "10"],
      ["2026-11-10", "2/3", "10"],
      ["2026-12-10", "3/3", "10"],
    ]);
  });

  it("valor total: divide em parcelas com os centavos certos", () => {
    expect(dividirEmParcelas(100, 3)).toEqual([33.33, 33.33, 33.34]);
    const r = gerarRepeticoes({ nome: "Tênis", valor: 100, vencimento: "2026-10-05", categoria: "Compras", tipo: "parcela" }, 3, { valorTotal: true });
    expect(r.map((x) => x.amount)).toEqual([33.33, 33.33, 33.34]);
  });

  it("já paguei algumas: cria só as que faltam, a partir do vencimento informado", () => {
    const r = gerarRepeticoes({ nome: "Celular", valor: 50, vencimento: "2026-10-15", categoria: "Compras", tipo: "parcela" }, 5, { primeira: 3 });
    expect(r.map((x) => [x.parcela, x.vencimento])).toEqual([
      ["3/5", "2026-10-15"],
      ["4/5", "2026-11-15"],
      ["5/5", "2026-12-15"],
    ]);
  });

  it("acha as próximas parcelas da mesma compra", () => {
    const contas = gerarRepeticoes({ nome: "Gang", valor: 60, vencimento: "2026-10-10", categoria: "Compras", tipo: "parcela" }, 3).map(
      (c, i) => ({ id: `g${i}`, ...c }) as Bill
    );
    const outra = { id: "x", name: "Faculdade", amount: 155, dueDate: "10", category: "Educação", paid: false, parcela: "3/3" } as Bill;
    expect(proximasParcelas(contas[0], [...contas, outra]).map((c) => c.parcela)).toEqual(["2/3", "3/3"]);
    expect(proximasParcelas(contas[2], contas)).toEqual([]);
  });

  it("agrupa por mês com o total a pagar", () => {
    const { linhas } = lerPlanilha(PLANILHA);
    const grupos = agruparPorMes(linhas.map((l, i) => ({ id: `b${i}`, ...contaDaLinha(l) })), "2026-09-25");
    expect(grupos.map((g) => g.mes)).toEqual(["2026-09", "2026-10"]);
    expect(grupos[0].aPagar).toBe(120);
    expect(grupos[0].pago).toBe(1270);
    expect(grupos[1].aPagar).toBeCloseTo(322.49);
    expect(grupos[1].contas[0].conta.name).toBe("Loja carne");
  });
});
