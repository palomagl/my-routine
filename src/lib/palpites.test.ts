import { describe, it, expect } from "vitest";
import { sugerirCategoria } from "./palpites";

describe("palpite de categoria", () => {
  it("adivinha pelo texto do gasto", () => {
    expect(sugerirCategoria("Mercado")).toBe("Alimentação");
    expect(sugerirCategoria("uber pra faculdade")).toBe("Transporte");
    expect(sugerirCategoria("Netflix")).toBe("Assinaturas");
    expect(sugerirCategoria("Claude")).toBe("Estudos");
    expect(sugerirCategoria("notebook novo")).toBe("Estudos");
    expect(sugerirCategoria("Livro de cálculo")).toBe("Estudos");
    expect(sugerirCategoria("curso de inglês")).toBe("Estudos");
    expect(sugerirCategoria("Farmácia")).toBe("Saúde");
    expect(sugerirCategoria("presente da mãe")).toBeNull();
  });
});
