import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAcaoUnica } from "./useAcaoUnica";

/** Uma promessa que só resolve quando a gente mandar — simula a rede lenta. */
function promessaControlada<T>() {
  let resolver!: (v: T) => void;
  let rejeitar!: (e: unknown) => void;
  const promessa = new Promise<T>((ok, erro) => {
    resolver = ok;
    rejeitar = erro;
  });
  return { promessa, resolver, rejeitar };
}

describe("useAcaoUnica", () => {
  it("deixa a ação rodar normalmente", async () => {
    const acao = vi.fn().mockResolvedValue("pronto");
    const { result } = renderHook(() => useAcaoUnica(acao));

    expect(result.current.ocupado).toBe(false);
    await act(async () => {
      await result.current.disparar();
    });

    expect(acao).toHaveBeenCalledTimes(1);
  });

  it("ignora o segundo toque enquanto o primeiro não terminou", async () => {
    // É este o bug das contas duplicadas: dois toques, dois registros.
    const { promessa, resolver } = promessaControlada<void>();
    const acao = vi.fn().mockReturnValue(promessa);
    const { result } = renderHook(() => useAcaoUnica(acao));

    act(() => {
      result.current.disparar();
      result.current.disparar();
      result.current.disparar();
    });

    expect(acao).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolver();
      await promessa;
    });
  });

  it("marca ocupado enquanto roda e solta no fim", async () => {
    const { promessa, resolver } = promessaControlada<void>();
    const { result } = renderHook(() => useAcaoUnica(() => promessa));

    act(() => {
      result.current.disparar();
    });
    expect(result.current.ocupado).toBe(true);

    await act(async () => {
      resolver();
      await promessa;
    });
    expect(result.current.ocupado).toBe(false);
  });

  it("libera para tentar de novo depois que termina", async () => {
    const acao = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAcaoUnica(acao));

    await act(async () => {
      await result.current.disparar();
    });
    await act(async () => {
      await result.current.disparar();
    });

    expect(acao).toHaveBeenCalledTimes(2);
  });

  it("libera mesmo quando a ação falha", async () => {
    // Sem isto, um erro de rede travaria o botão para sempre.
    const acao = vi.fn().mockRejectedValue(new Error("caiu"));
    const { result } = renderHook(() => useAcaoUnica(acao));

    await act(async () => {
      await result.current.disparar().catch(() => {});
    });

    expect(result.current.ocupado).toBe(false);
  });

  it("repassa os argumentos e devolve o resultado", async () => {
    const acao = vi.fn(async (a: number, b: number) => a + b);
    const { result } = renderHook(() => useAcaoUnica(acao));

    let soma: number | undefined;
    await act(async () => {
      soma = await result.current.disparar(2, 3);
    });

    expect(soma).toBe(5);
    expect(acao).toHaveBeenCalledWith(2, 3);
  });
});
