import { registerSW } from "virtual:pwa-register";
import { toast } from "sonner";

// ==============================================
// Avisar quando sai versão nova
// ==============================================
// O app é instalável e guarda uma cópia de si mesmo para abrir sem internet.
// O efeito colateral é que uma versão nova pode ficar instalada e esperando
// enquanto a tela continua rodando a antiga — a pessoa conserta algo, publica,
// abre o app e vê o problema de novo, sem entender por quê.
//
// Aqui o app passa a avisar e a atualizar com um toque, em vez de exigir que
// se feche tudo e reabra duas vezes.

export function vigiarAtualizacoes() {
  // Em desenvolvimento não há service worker: nada a vigiar.
  if (!import.meta.env.PROD) return;

  const atualizar = registerSW({
    immediate: true,

    onNeedRefresh() {
      toast("Tem uma versão nova do app", {
        description: "Atualize para ver as novidades.",
        duration: Infinity,
        action: {
          label: "Atualizar",
          // `true` recarrega a página assim que o service worker assume.
          onClick: () => atualizar(true),
        },
      });
    },

    onRegisterError(erro) {
      console.error("[pwa] não consegui registrar o service worker:", erro);
    },
  });
}
