import { useCallback, useRef, useState } from "react";

// ==============================================
// Uma ação de cada vez
// ==============================================
// Botão que grava no banco e não trava enquanto grava é botão que duplica:
// no celular, um toque duplo — ou um segundo toque porque a rede demorou e
// pareceu que não pegou — cria dois registros. Foi assim que apareceram as
// contas de internet e as faturas repetidas.
//
// Este hook deixa passar a primeira chamada e descarta as seguintes até ela
// terminar, e devolve `ocupado` para a tela desabilitar o botão — a pessoa
// precisa ver que algo está acontecendo, não só ser impedida em silêncio.

export interface AcaoUnica<A extends unknown[], R> {
  disparar: (...args: A) => Promise<R | undefined>;
  ocupado: boolean;
}

export function useAcaoUnica<A extends unknown[], R>(
  acao: (...args: A) => Promise<R>
): AcaoUnica<A, R> {
  const [ocupado, setOcupado] = useState(false);
  // A trava é um ref, não o estado: `setOcupado` só vale no próximo render, e
  // dois toques no mesmo quadro passariam os dois pela checagem.
  const rodando = useRef(false);

  const disparar = useCallback(
    async (...args: A): Promise<R | undefined> => {
      if (rodando.current) return undefined;
      rodando.current = true;
      setOcupado(true);
      try {
        return await acao(...args);
      } finally {
        // No finally para que um erro de rede não deixe o botão travado.
        rodando.current = false;
        setOcupado(false);
      }
    },
    [acao]
  );

  return { disparar, ocupado };
}
