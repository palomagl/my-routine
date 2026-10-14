import { useMemo, useState } from "react";
import { CreditCard, Plus } from "lucide-react";
import { billsApi, type Transaction } from "@/lib/db";
import {
  BANCOS,
  comprasDaFatura,
  faturaAberta,
  faturaDaCompra,
  nomeCompleto,
  nomeDaFatura,
  totalDaFatura,
  vencimentoDaFatura,
  type BancoCartao,
  type Cartao,
} from "@/lib/cartoes";
import { useCartoes, useContas, useTransacoes } from "@/lib/aoVivo";
import { dayKey } from "@/lib/dates";
import { executar } from "@/lib/acoes";
import { cn } from "@/lib/utils";
import { useLocale } from "@/contexts/LocaleContext";
import { CartaoDialog } from "@/desktop/Formularios";

// Os cartões de crédito, no fim das Finanças: um retângulo com a cara do
// cartão de verdade (roxo do Nubank, vermelho do Santander), o quanto já tem
// na fatura aberta e, ao tocar, as compras daquela fatura.
//
// A fatura não existe no banco: é a soma das compras com aquele cartão. Só
// quando a fatura é paga nasce uma conta paga — é ela que desconta do saldo.

const reais = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const diaMes = (chave: string) => `${chave.slice(8)}/${chave.slice(5, 7)}`;

/**
 * Os detalhes que fazem o retângulo parecer um cartão: chip, aproximação e a
 * marca do banco. São desenhos nossos, no espírito de cada banco (o roxo com
 * letra minúscula, o vermelho com a chama) — não são as logomarcas deles.
 */
function Chip() {
  return (
    <span
      aria-hidden
      className="relative grid h-8 w-11 shrink-0 place-items-center overflow-hidden rounded-md ring-1 ring-black/15"
      style={{ backgroundImage: "linear-gradient(135deg,#f7e9a6,#d9b448 45%,#b8902b)" }}
    >
      <span className="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-black/25" />
      <span className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-black/25" />
      <span className="absolute left-1 top-1/2 h-3.5 w-3 -translate-y-1/2 rounded-sm ring-1 ring-black/20" />
    </span>
  );
}

function Aproximacao() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5 shrink-0 text-white/70" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <path d="M8 9.5a4.5 4.5 0 0 1 0 5" />
      <path d="M11.5 7a8 8 0 0 1 0 10" />
      <path d="M15 4.5a11.5 11.5 0 0 1 0 15" />
    </svg>
  );
}

/** O cartão em si: o que a pessoa vê e reconhece como "o roxo" ou "o vermelho". */
export function CartaoDesenho({
  cartao,
  total,
  vence,
  paga,
}: {
  cartao: Pick<Cartao, "nome" | "banco" | "fechamento">;
  total: number;
  vence: string;
  paga: boolean;
}) {
  const { t } = useLocale();
  const banco = BANCOS[cartao.banco];

  return (
    <div
      className="relative flex aspect-[1.7] w-full flex-col justify-between overflow-hidden rounded-2xl p-4 text-white shadow-lg ring-1 ring-black/10"
      style={{ backgroundImage: `linear-gradient(135deg, ${banco.de}, ${banco.para})` }}
    >
      {/* Brilho de canto: é o que faz parecer plástico, e não um retângulo colorido. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-20 h-52 w-52 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.20), transparent 70%)" }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-16 h-52 w-52 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(0,0,0,0.18), transparent 70%)" }}
      />

      <div className="relative flex items-start justify-between gap-2">
        <MarcaDoBanco banco={cartao.banco} />
        {/* As ondinhas do pagamento por aproximação. */}
        <Aproximacao />
      </div>

      <div className="relative flex items-center gap-3">
        <Chip />
        <span className="font-mono text-[13px] tracking-[0.18em] text-white/55">•••• ••••</span>
      </div>

      <div className="relative flex items-end justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-[10px] uppercase tracking-[0.14em] text-white/60">{paga ? t("faturaPaga") : t("faturaAberta")}</span>
          <span className="block text-2xl font-bold leading-none tabular-nums">{reais(total)}</span>
          <span className="mt-1.5 block truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85">{cartao.nome}</span>
        </span>
        <span className="shrink-0 text-right text-[11px] leading-snug text-white/70">
          {t("faturaFecha").replace("{dia}", String(cartao.fechamento))}
          <br />
          {t("faturaVence").replace("{dia}", diaMes(vence))}
        </span>
      </div>
    </div>
  );
}

function MarcaDoBanco({ banco }: { banco: BancoCartao }) {
  if (banco === "nubank") {
    return <span className="text-lg font-extrabold lowercase leading-none tracking-tight">nu</span>;
  }
  if (banco === "santander") {
    return (
      <span className="flex items-center gap-1.5">
        <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5">
          <path d="M12 3c3 3.2 4.5 5.6 4.5 8.1 0 2-1.3 3.6-3.1 4.4.5-1.6.2-3.1-1.4-5.3-1.6 2.2-1.9 3.7-1.4 5.3-1.8-.8-3.1-2.4-3.1-4.4C7.5 8.6 9 6.2 12 3Z" fill="#fff" fillOpacity="0.92" />
          <path d="M5 13c1.2 4 3.8 6 7 6s5.8-2 7-6c.6 1.3.9 2.5.9 3.6 0 2.9-3.5 4.9-7.9 4.9S4.1 19.5 4.1 16.6c0-1.1.3-2.3.9-3.6Z" fill="#fff" fillOpacity="0.6" />
        </svg>
        <span className="text-[13px] font-bold uppercase leading-none tracking-wide">Santander</span>
      </span>
    );
  }
  return <span className="text-[13px] font-bold uppercase leading-none tracking-wide">Cartão</span>;
}

export function Cartoes({ aoEditarCompra }: { aoEditarCompra?: (compra: Transaction) => void }) {
  const { t } = useLocale();
  const cartoes = useCartoes().itens;
  const transacoes = useTransacoes().itens;
  const contas = useContas().itens;
  const [aberto, setAberto] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<{ inicial?: Cartao } | null>(null);

  const hoje = dayKey();
  const faturas = useMemo(
    () =>
      cartoes.map((cartao) => {
        const mes = faturaAberta(cartao, hoje);
        const nome = nomeDaFatura(cartao, mes);
        return {
          cartao,
          mes,
          total: totalDaFatura(transacoes, cartao, mes),
          vence: vencimentoDaFatura(mes, cartao),
          compras: comprasDaFatura(transacoes, cartao, mes),
          paga: contas.some((c) => c.name === nome && c.paid),
        };
      }),
    [cartoes, transacoes, contas, hoje]
  );

  const faturaSelecionada = faturas.find((f) => f.cartao.id === aberto);

  const pagarFatura = (fatura: (typeof faturas)[number]) =>
    executar(
      () =>
        billsApi.create({
          name: nomeDaFatura(fatura.cartao, fatura.mes),
          amount: fatura.total,
          dueDate: String(Number(fatura.vence.slice(8))),
          vencimento: fatura.vence,
          category: "Outros",
          tipo: "cartao",
          paid: true,
        }),
      { erro: t("erroAoSalvar") }
    );

  return (
    <section className="glass-card rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold">
          <CreditCard className="h-4 w-4 text-violet-500" />
          {t("cartoesTitulo")}
        </h3>
        <button
          type="button"
          onClick={() => setDialogo({})}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> {t("cartaoNovo")}
        </button>
      </div>

      {cartoes.length === 0 && <p className="py-5 text-center text-sm text-muted-foreground">{t("cartoesVazio")}</p>}

      {/* Largura travada: num monitor largo, meia tela de cartão fica enorme —
          ele tem que parecer um cartão, não um banner. */}
      {/* No celular os cartões deslizam de lado, um ao lado do outro, como na
          carteira — três cartões empilhados tomavam a tela inteira. No
          computador viram grade, com a largura travada: meia tela de cartão
          parece banner, não cartão. */}
      <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:snap-none sm:overflow-visible sm:px-0 sm:[grid-template-columns:repeat(auto-fill,minmax(220px,300px))]">
        {faturas.map((f) => (
          <button
            key={f.cartao.id}
            type="button"
            onClick={() => setAberto(aberto === f.cartao.id ? null : f.cartao.id)}
            aria-expanded={aberto === f.cartao.id}
            className={cn(
              "w-[230px] shrink-0 snap-start rounded-2xl text-left transition-transform active:scale-[0.98] sm:w-auto",
              aberto === f.cartao.id && "ring-2 ring-foreground/70 ring-offset-2 ring-offset-background"
            )}
          >
            <CartaoDesenho cartao={f.cartao} total={f.total} vence={f.vence} paga={f.paga} />
          </button>
        ))}
      </div>

      {/* As compras ficam embaixo da fileira, não dentro do cartão: assim o
          cartão aberto não empurra os outros para fora da tela. */}
      {faturaSelecionada && (
        <div className="mt-3 rounded-xl bg-secondary/50 p-2">
          <p className="px-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {nomeCompleto(faturaSelecionada.cartao)}
          </p>
          {faturaSelecionada.compras.length === 0 && (
            <p className="py-3 text-center text-xs text-muted-foreground">{t("faturaSemCompras")}</p>
          )}
          {faturaSelecionada.compras.map((compra) => (
            <button
              key={compra.id}
              type="button"
              onClick={() => aoEditarCompra?.(compra)}
              className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left text-sm transition-colors active:bg-background/60"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{compra.description}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {diaMes(compra.date)} · {compra.category ?? "Outros"}
                </span>
              </span>
              <span className={cn("shrink-0 font-semibold tabular-nums", compra.type === "income" && "text-emerald-500")}>
                {compra.type === "income" ? "−" : ""} {reais(compra.amount)}
              </span>
            </button>
          ))}

          <div className="mt-1 flex items-center justify-between gap-2 border-t border-border/60 px-1.5 pt-2">
            <button
              type="button"
              onClick={() => setDialogo({ inicial: faturaSelecionada.cartao })}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-background/60 hover:text-foreground"
            >
              {t("cartaoEditar")}
            </button>
            {faturaSelecionada.total > 0 && !faturaSelecionada.paga && (
              <button
                type="button"
                onClick={() => pagarFatura(faturaSelecionada)}
                className="rounded-lg bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400"
              >
                {t("faturaMarcarPaga")}
              </button>
            )}
          </div>
        </div>
      )}

      <CartaoDialog aberto={!!dialogo} inicial={dialogo?.inicial} onFechar={() => setDialogo(null)} />
    </section>
  );
}

/** Quanto ainda vai cair nas faturas que não foram pagas (entra no "a pagar" do mês). */
export function totalDasFaturasAbertas(
  cartoes: Cartao[],
  transacoes: Transaction[],
  faturaPaga: (cartao: Cartao, mes: string) => boolean,
  hoje: string
): number {
  return cartoes.reduce((soma, cartao) => {
    const mes = faturaDaCompra(hoje, cartao.fechamento);
    if (faturaPaga(cartao, mes)) return soma;
    return soma + totalDaFatura(transacoes, cartao, mes);
  }, 0);
}

export { nomeCompleto };
