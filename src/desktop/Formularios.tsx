import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Layers, Plus, Receipt, Repeat, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocale } from "@/contexts/LocaleContext";
import { executar } from "@/lib/acoes";
import { useCartoes, useContas } from "@/lib/aoVivo";
import { BANCOS, nomeCompleto, type BancoCartao, type Cartao } from "@/lib/cartoes";
import { ICONES_META, lerMeta, lerNumero, mesCurto, progressoDe, somarMesesAoMes, sugerirIcone, textosLegados, type TipoMeta } from "@/lib/metas";
import { useTextosMeta } from "@/components/metas/Metas";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { dayKey } from "@/lib/dates";
import {
  billsApi,
  carteiraApi,
  cartoesApi,
  CATEGORIAS_TRANSACAO,
  goalsApi,
  transactionsApi,
  type Bill,
  type Carteira,
  type CategoriaTransacao,
  type Goal,
  type TipoConta,
  type Transaction,
} from "@/lib/db";
import { cn } from "@/lib/utils";
import { lerValor } from "./calculos";
import { normalizarCategoria } from "./categorias";
import { sugerirCategoria } from "@/lib/palpites";
import { CATEGORIAS_CONTA, classificar, gerarRepeticoes, proximasParcelas, vencimentoDe } from "./contas";
import { reais } from "./formato";

function valorParaTexto(v: number | undefined) {
  if (v === undefined) return "";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function Campo({ rotulo, children, className }: { rotulo: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-xs font-semibold text-muted-foreground">{rotulo}</span>
      {children}
    </label>
  );
}

const campo = "h-11 rounded-xl bg-background";

/** Valor do seletor para "não foi no cartão" (o Select não aceita valor vazio). */
const SEM_CARTAO = "dinheiro";

function Janela({
  aberto,
  onFechar,
  titulo,
  descricao,
  children,
  onSalvar,
  salvando,
  podeSalvar,
  rodapeExtra,
  largura = "max-w-md",
}: {
  aberto: boolean;
  onFechar: () => void;
  titulo: string;
  descricao?: string;
  children: ReactNode;
  onSalvar: () => void;
  salvando: boolean;
  podeSalvar: boolean;
  /** Fica à esquerda, antes de Cancelar/Salvar. */
  rodapeExtra?: ReactNode;
  largura?: string;
}) {
  const { t } = useLocale();
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (podeSalvar && !salvando) onSalvar();
  };
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className={cn(largura, "max-h-[92vh] overflow-y-auto rounded-3xl")}>
        <form onSubmit={enviar} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            {descricao && <DialogDescription>{descricao}</DialogDescription>}
          </DialogHeader>
          <div className="space-y-4">{children}</div>
          <DialogFooter className="gap-2 sm:gap-0">
            {rodapeExtra && <div className="flex items-center sm:mr-auto">{rodapeExtra}</div>}
            <Button type="button" variant="ghost" className="rounded-xl" onClick={onFechar}>
              {t("cancel")}
            </Button>
            <Button type="submit" className="rounded-xl" disabled={!podeSalvar || salvando}>
              {salvando ? "..." : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** "Excluir" que pede um segundo clique antes de apagar (fica à esquerda do rodapé). */
function BotaoExcluir({ rotulo, onExcluir, aberto }: { rotulo: string; onExcluir: () => Promise<unknown>; aberto: boolean }) {
  const { t } = useLocale();
  const [confirmar, setConfirmar] = useState(false);
  useEffect(() => {
    if (aberto) setConfirmar(false);
  }, [aberto]);
  return (
    <button
      type="button"
      onClick={() => (confirmar ? onExcluir() : setConfirmar(true))}
      className={cn(
        "rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors",
        confirmar ? "bg-destructive/10 text-destructive" : "text-muted-foreground hover:text-destructive"
      )}
    >
      {confirmar ? t("cliqueDeNovoExcluir") : rotulo}
    </button>
  );
}

// ----------------------------------------------
// Transação
// ----------------------------------------------

export function TransacaoDialog({
  aberto,
  onFechar,
  inicial,
  tipoInicial = "expense",
}: {
  aberto: boolean;
  onFechar: () => void;
  inicial?: Transaction;
  /** Para os atalhos "Gasto" e "Entrada". */
  tipoInicial?: Transaction["type"];
}) {
  const { t } = useLocale();
  const [tipo, setTipo] = useState<Transaction["type"]>("expense");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [categoria, setCategoria] = useState<CategoriaTransacao>("Outros");
  const [data, setData] = useState(dayKey());
  const [cartaoId, setCartaoId] = useState(SEM_CARTAO);
  const [categoriaTocada, setCategoriaTocada] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const cartoes = useCartoes().itens;

  useEffect(() => {
    if (!aberto) return;
    setTipo(inicial?.type ?? tipoInicial);
    setDescricao(inicial?.description ?? "");
    setValor(valorParaTexto(inicial?.amount));
    setCategoria(normalizarCategoria(inicial?.category));
    setData(inicial?.date || dayKey());
    setCartaoId(inicial?.cardId ?? SEM_CARTAO);
    setCategoriaTocada(!!inicial);
  }, [aberto, inicial, tipoInicial]);

  // "Mercado" já vem como Alimentação, "Uber" como Transporte (dá para trocar).
  useEffect(() => {
    if (categoriaTocada || tipo !== "expense") return;
    setCategoria(sugerirCategoria(descricao) ?? "Outros");
  }, [descricao, tipo, categoriaTocada]);

  const numero = lerValor(valor);
  const podeSalvar = descricao.trim().length > 0 && numero > 0 && !!data;

  const salvar = async () => {
    setSalvando(true);
    // No crédito guarda o cartão; no dinheiro manda `null`, que apaga o campo
    // — sem cartão, o gasto sai do saldo na hora, como sempre foi.
    const noCartao = cartaoId !== SEM_CARTAO && cartoes.some((c) => c.id === cartaoId);
    const dados = {
      description: descricao.trim(),
      amount: numero,
      type: tipo,
      category: categoria,
      date: data,
      cardId: noCartao ? cartaoId : null,
    };
    const ok = await executar(
      async () => {
        if (inicial) await transactionsApi.update(inicial.id, dados);
        else await transactionsApi.create(dados);
      },
      { erro: inicial ? t("erroAoSalvar") : t("erroAoAdicionar") }
    );
    setSalvando(false);
    if (ok !== null) onFechar();
  };

  const excluir = async () => {
    if (!inicial) return;
    const ok = await executar(() => transactionsApi.delete(inicial.id), { erro: t("erroAoExcluir") });
    if (ok !== null) onFechar();
  };

  return (
    <Janela
      aberto={aberto}
      onFechar={onFechar}
      titulo={inicial ? t("financesEditTransaction") : t("financesNewTransaction")}
      onSalvar={salvar}
      salvando={salvando}
      podeSalvar={podeSalvar}
      rodapeExtra={inicial ? <BotaoExcluir rotulo={t("financesDeleteTransaction")} onExcluir={excluir} aberto={aberto} /> : undefined}
    >
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1" role="radiogroup" aria-label={t("tipo")}>
        {(["expense", "income"] as const).map((op) => (
          <button
            key={op}
            type="button"
            role="radio"
            aria-checked={tipo === op}
            onClick={() => setTipo(op)}
            className={cn(
              "rounded-lg py-2 text-sm font-semibold transition-colors",
              tipo === op ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {op === "expense" ? t("gasto") : t("entrada")}
          </button>
        ))}
      </div>
      <Campo rotulo={t("financesDescription")}>
        <Input autoFocus value={descricao} onChange={(e) => setDescricao(e.target.value)} className={campo} placeholder={t("exDescricao")} />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo={t("financesAmount")}>
          <Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className={campo} placeholder="0,00" />
        </Campo>
        <Campo rotulo={t("data")}>
          <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className={campo} />
        </Campo>
      </div>
      <Campo rotulo={t("financeCategoryField")}>
        <Select
          value={categoria}
          onValueChange={(v) => {
            setCategoria(v as CategoriaTransacao);
            setCategoriaTocada(true);
          }}
        >
          <SelectTrigger className={campo}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIAS_TRANSACAO.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Campo>
      {tipo === "expense" && cartoes.length > 0 && (
        <Campo rotulo={t("comoPagou")}>
          <Select value={cartaoId} onValueChange={setCartaoId}>
            <SelectTrigger className={campo}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_CARTAO}>{t("pagouNoDinheiro")}</SelectItem>
              {cartoes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {nomeCompleto(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
      )}
    </Janela>
  );
}

// ----------------------------------------------
// Cartão de crédito
// ----------------------------------------------

export function CartaoDialog({ aberto, onFechar, inicial }: { aberto: boolean; onFechar: () => void; inicial?: Cartao }) {
  const { t } = useLocale();
  const [nome, setNome] = useState("");
  const [banco, setBanco] = useState<BancoCartao>("nubank");
  const [fechamento, setFechamento] = useState("20");
  const [vencimento, setVencimento] = useState("27");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setNome(inicial?.nome ?? "");
    setBanco(inicial?.banco ?? "nubank");
    setFechamento(String(inicial?.fechamento ?? 20));
    setVencimento(String(inicial?.vencimento ?? 27));
  }, [aberto, inicial]);

  const dia = (texto: string) => Math.min(Math.max(parseInt(texto, 10) || 1, 1), 31);
  const podeSalvar = nome.trim().length > 0;

  const salvar = async () => {
    setSalvando(true);
    const dados = { nome: nome.trim(), banco, fechamento: dia(fechamento), vencimento: dia(vencimento) };
    const ok = await executar(
      async () => {
        if (inicial) await cartoesApi.update(inicial.id, dados);
        else await cartoesApi.create({ ...dados, criadoEm: new Date().toISOString() });
      },
      { erro: inicial ? t("erroAoSalvar") : t("erroAoAdicionar") }
    );
    setSalvando(false);
    if (ok !== null) onFechar();
  };

  const excluir = async () => {
    if (!inicial) return;
    const ok = await executar(() => cartoesApi.delete(inicial.id), { erro: t("erroAoExcluir") });
    if (ok !== null) onFechar();
  };

  return (
    <Janela
      aberto={aberto}
      onFechar={onFechar}
      titulo={inicial ? t("cartaoEditar") : t("cartaoNovo")}
      onSalvar={salvar}
      salvando={salvando}
      podeSalvar={podeSalvar}
      rodapeExtra={inicial ? <BotaoExcluir rotulo={t("cartaoExcluir")} onExcluir={excluir} aberto={aberto} /> : undefined}
    >
      <Campo rotulo={t("cartaoNome")}>
        <Input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} className={campo} placeholder={t("cartaoNomeEx")} />
      </Campo>
      <Campo rotulo={t("cartaoBanco")}>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(BANCOS) as BancoCartao[]).map((op) => (
            <button
              key={op}
              type="button"
              onClick={() => setBanco(op)}
              className={cn(
                "rounded-xl px-2 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.97]",
                banco === op ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : "opacity-70"
              )}
              style={{ backgroundImage: `linear-gradient(135deg, ${BANCOS[op].de}, ${BANCOS[op].para})` }}
            >
              {BANCOS[op].rotulo}
            </button>
          ))}
        </div>
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo={t("cartaoFechamento")}>
          <Input inputMode="numeric" value={fechamento} onChange={(e) => setFechamento(e.target.value)} className={campo} />
        </Campo>
        <Campo rotulo={t("cartaoVencimento")}>
          <Input inputMode="numeric" value={vencimento} onChange={(e) => setVencimento(e.target.value)} className={campo} />
        </Campo>
      </div>
    </Janela>
  );
}

// ----------------------------------------------
// Conta
// ----------------------------------------------

/**
 * Só três escolhas na tela: uma vez, parcelada ou todo mês. "Cartão" continua
 * existindo, mas quem decide é o nome ("Cartão Vó", "fatura..."): a pessoa
 * não precisa pensar nisso.
 */
type ComoPaga = "avulsa" | "parcela" | "fixa";
const paraEscolha = (tipo: TipoConta | undefined): ComoPaga => (tipo === "parcela" || tipo === "fixa" ? tipo : "avulsa");

const ATALHOS_VEZES: Record<"parcela" | "fixa", number[]> = {
  parcela: [2, 3, 4, 5, 6, 10, 12],
  fixa: [3, 6, 12, 24],
};

function dataCurta(chave: string) {
  return `${chave.slice(8)}/${chave.slice(5, 7)}/${chave.slice(0, 4)}`;
}

export function ContaDialog({ aberto, onFechar, inicial }: { aberto: boolean; onFechar: () => void; inicial?: Bill }) {
  const { t } = useLocale();
  const todas = useContas().itens;
  const [nome, setNome] = useState("");
  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState(dayKey());
  const [tipo, setTipo] = useState<ComoPaga>("avulsa");
  // null = o padrão do tipo (3 parcelas, 12 meses) até a pessoa mexer.
  const [vezes, setVezes] = useState<string | null>(null);
  const [valorTotal, setValorTotal] = useState(false);
  const [jaPaguei, setJaPaguei] = useState(false);
  const [primeira, setPrimeira] = useState("2");
  const [categoria, setCategoria] = useState("Compras");
  const [tipoTocado, setTipoTocado] = useState(false);
  const [categoriaTocada, setCategoriaTocada] = useState(false);
  const [trocandoCategoria, setTrocandoCategoria] = useState(false);
  const [nasProximas, setNasProximas] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setNome(inicial?.name ?? "");
    setValor(valorParaTexto(inicial?.amount));
    setVencimento(inicial ? vencimentoDe(inicial) : dayKey());
    setTipo(paraEscolha(inicial?.tipo));
    setVezes(null);
    setValorTotal(false);
    setJaPaguei(false);
    setPrimeira("2");
    setCategoria(inicial?.category ?? "Compras");
    setTipoTocado(!!inicial);
    setCategoriaTocada(!!inicial);
    setTrocandoCategoria(false);
    setNasProximas(true);
  }, [aberto, inicial]);

  // Enquanto a pessoa não escolheu, o nome sugere tipo e categoria
  // ("Internet" -> todo mês/Serviços, "Cartão Vó" -> cartão).
  useEffect(() => {
    if (inicial || !nome.trim()) return;
    const palpite = classificar(nome);
    if (!categoriaTocada) setCategoria(palpite.categoria);
    if (!tipoTocado) setTipo(paraEscolha(palpite.tipo));
  }, [nome, inicial, categoriaTocada, tipoTocado]);

  // "Uma vez" com nome de cartão vira conta de cartão (a etiqueta azul da lista).
  const tipoFinal: TipoConta = tipo === "avulsa" && classificar(nome).tipo === "cartao" ? "cartao" : tipo;

  const numero = lerValor(valor);
  const vezesTexto = vezes ?? (tipo === "fixa" ? "12" : "3");
  const n = parseInt(vezesTexto, 10);
  const repete = !inicial && (tipo === "parcela" || tipo === "fixa");
  const nValido = !repete || (n >= 2 && n <= 120);
  const inicio = repete && tipo === "parcela" && jaPaguei ? parseInt(primeira, 10) : 1;
  const inicioValido = !repete || (inicio >= 1 && inicio <= n);
  const podeSalvar = nome.trim().length > 0 && numero > 0 && !!vencimento && nValido && inicioValido;

  const proximas = useMemo(() => (inicial?.parcela ? proximasParcelas(inicial, todas) : []), [inicial, todas]);

  // O que vai ser criado, para mostrar antes de salvar.
  const previa = useMemo(() => {
    if (!repete || !podeSalvar) return null;
    return gerarRepeticoes(
      { nome: nome.trim(), valor: numero, vencimento, categoria, tipo: tipoFinal },
      n,
      { primeira: inicio, valorTotal: tipo === "parcela" && valorTotal }
    );
  }, [repete, podeSalvar, nome, numero, vencimento, categoria, tipo, tipoFinal, n, inicio, valorTotal]);

  const categorias = CATEGORIAS_CONTA.includes(categoria) ? CATEGORIAS_CONTA : [...CATEGORIAS_CONTA, categoria];

  const salvar = async () => {
    setSalvando(true);
    const ok = await executar(
      async () => {
        if (inicial) {
          const mudancas = { name: nome.trim(), amount: numero, category: categoria, tipo: tipoFinal };
          await billsApi.update(inicial.id, { ...mudancas, vencimento, dueDate: String(Number(vencimento.slice(8))) });
          if (nasProximas) await Promise.all(proximas.map((c) => billsApi.update(c.id, mudancas)));
          return;
        }
        const contas = previa ?? gerarRepeticoes({ nome: nome.trim(), valor: numero, vencimento, categoria, tipo: tipoFinal }, 1);
        await Promise.all(contas.map((c) => billsApi.create(c)));
      },
      { erro: inicial ? t("erroAoSalvar") : t("erroAoAdicionar") }
    );
    setSalvando(false);
    if (ok !== null) onFechar();
  };

  const excluir = async () => {
    if (!inicial) return;
    const ok = await executar(() => billsApi.delete(inicial.id), { erro: t("erroAoExcluir") });
    if (ok !== null) onFechar();
  };

  const opcoes: { valor: ComoPaga; Icone: typeof Receipt; rotulo: string; dica: string }[] = [
    { valor: "avulsa", Icone: Receipt, rotulo: t("comoUmaVez"), dica: t("comoUmaVezDica") },
    { valor: "parcela", Icone: Layers, rotulo: t("comoParcelada"), dica: t("comoParceladaDica") },
    { valor: "fixa", Icone: Repeat, rotulo: t("comoTodoMes"), dica: t("comoTodoMesDica") },
  ];

  const rotuloValor = inicial?.parcela
    ? t("valorDaParcela")
    : tipo === "fixa" && repete
      ? t("valorPorMes")
      : tipo === "parcela" && repete
        ? valorTotal
          ? t("valorTotalCompra")
          : t("valorDaParcela")
        : t("financesAmount");

  const rotuloVencimento = !repete ? t("vencimento") : inicio > 1 ? t("proximaVenceEm") : t("primeiroVencimento");

  return (
    <Janela
      aberto={aberto}
      onFechar={onFechar}
      titulo={inicial ? t("financesEditBill") : t("financesNewBill")}
      descricao={inicial?.parcela ? `${t("tipoParcela")} ${inicial.parcela}` : undefined}
      onSalvar={salvar}
      salvando={salvando}
      podeSalvar={podeSalvar}
      largura="max-w-lg"
      rodapeExtra={inicial ? <BotaoExcluir rotulo={t("financesDeleteBill")} onExcluir={excluir} aberto={aberto} /> : undefined}
    >
      <Campo rotulo={t("financesBillName")}>
        <Input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} className={campo} placeholder={t("exConta")} />
      </Campo>

      <div className="space-y-1.5">
        <span className="text-xs font-semibold text-muted-foreground">{t("comoEConta")}</span>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("comoEConta")}>
          {opcoes.map(({ valor: v, Icone, rotulo, dica }) => {
            const ativo = tipo === v;
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={ativo}
                onClick={() => {
                  setTipo(v);
                  setTipoTocado(true);
                }}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-2xl border px-1.5 pb-2 pt-2.5 text-center transition-colors",
                  ativo
                    ? "border-primary bg-primary/[0.07] text-foreground ring-1 ring-primary"
                    : "border-border/80 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                )}
              >
                <Icone className={cn("h-5 w-5", ativo && "text-primary")} />
                <span className="text-[13px] font-semibold leading-tight">{rotulo}</span>
                <span className="text-[10.5px] leading-tight text-muted-foreground">{dica}</span>
              </button>
            );
          })}
        </div>
      </div>

      {repete && (
        <div className="space-y-2 rounded-2xl bg-secondary/60 p-3">
          <span className="text-xs font-semibold text-muted-foreground">
            {tipo === "parcela" ? t("emQuantasVezes") : t("quantosMeses")}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {ATALHOS_VEZES[tipo as "parcela" | "fixa"].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setVezes(String(q))}
                aria-pressed={n === q}
                className={cn(
                  "h-9 min-w-[44px] rounded-xl px-2.5 text-sm font-semibold tabular-nums transition-colors",
                  n === q ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-card/70"
                )}
              >
                {tipo === "parcela" ? `${q}x` : q}
              </button>
            ))}
            <Input
              type="number"
              min={2}
              max={120}
              value={vezesTexto}
              onChange={(e) => setVezes(e.target.value)}
              aria-label={tipo === "parcela" ? t("emQuantasVezes") : t("quantosMeses")}
              className="h-9 w-[72px] rounded-xl bg-card text-center tabular-nums"
            />
          </div>
          {tipo === "parcela" && (
            <label className="flex cursor-pointer items-center gap-2 pt-1 text-sm">
              <input
                type="checkbox"
                checked={jaPaguei}
                onChange={(e) => setJaPaguei(e.target.checked)}
                className="h-4 w-4 accent-[hsl(var(--primary))]"
              />
              {t("jaPagueiAlgumas")}
              {jaPaguei && (
                <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                  {t("proximaParcela")}
                  <Input
                    type="number"
                    min={2}
                    max={n || 120}
                    value={primeira}
                    onChange={(e) => setPrimeira(e.target.value)}
                    aria-label={t("proximaParcela")}
                    className="h-8 w-14 rounded-lg bg-card text-center tabular-nums"
                  />
                  {t("deN").replace("{n}", Number.isFinite(n) ? String(n) : "?")}
                </span>
              )}
            </label>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Campo rotulo={rotuloValor}>
            <Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className={campo} placeholder="0,00" />
          </Campo>
          {repete && tipo === "parcela" && (
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-secondary p-0.5 text-[11px] font-semibold" role="radiogroup" aria-label={t("financesAmount")}>
              {[false, true].map((total) => (
                <button
                  key={String(total)}
                  type="button"
                  role="radio"
                  aria-checked={valorTotal === total}
                  onClick={() => setValorTotal(total)}
                  className={cn(
                    "rounded-md py-1 transition-colors",
                    valorTotal === total ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {total ? t("valorEhTotal") : t("valorEhParcela")}
                </button>
              ))}
            </div>
          )}
        </div>
        <Campo rotulo={rotuloVencimento}>
          <Input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} className={campo} />
        </Campo>
      </div>

      {/* A categoria sai sozinha do nome; só abre o seletor se a pessoa quiser trocar. */}
      {trocandoCategoria ? (
        <Campo rotulo={t("financeCategoryField")}>
          <Select
            value={categoria}
            onValueChange={(v) => {
              setCategoria(v);
              setCategoriaTocada(true);
            }}
          >
            <SelectTrigger className={campo}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categorias.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t("financeCategoryField")}: <span className="font-semibold text-foreground">{categoria}</span>
          {" · "}
          <button type="button" onClick={() => setTrocandoCategoria(true)} className="font-semibold text-primary hover:underline">
            {t("trocar")}
          </button>
        </p>
      )}

      {previa && previa.length > 0 && (
        <div className="rounded-2xl border border-primary/25 bg-primary/[0.05] px-4 py-3 text-sm" aria-live="polite">
          <p className="font-semibold">
            {t("previaContas")
              .replace("{n}", String(previa.length))
              .replace("{valor}", reais(previa[0].amount, { centavos: true }))}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {previa[0].parcela && `${previa[0].parcela} → ${previa[previa.length - 1].parcela} · `}
            {t("previaPeriodo")
              .replace("{de}", dataCurta(previa[0].vencimento!))
              .replace("{ate}", dataCurta(previa[previa.length - 1].vencimento!))}
            {" · "}
            {t("previaTotal").replace("{valor}", reais(previa.reduce((s, c) => s + c.amount, 0), { centavos: true }))}
          </p>
        </div>
      )}

      {inicial && proximas.length > 0 && (
        <label className="flex cursor-pointer items-start gap-2 rounded-2xl bg-secondary/60 p-3 text-sm">
          <input
            type="checkbox"
            checked={nasProximas}
            onChange={(e) => setNasProximas(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
          />
          <span>
            {t("aplicarProximas").replace("{n}", String(proximas.length))}
            <span className="block text-xs text-muted-foreground">{t("aplicarProximasDica")}</span>
          </span>
        </label>
      )}
    </Janela>
  );
}

// ----------------------------------------------
// Saldo informado (carteira)
// ----------------------------------------------

interface LinhaCarteira {
  chave: number;
  nome: string;
  valor: string;
}

export function AjustarSaldoDialog({
  aberto,
  onFechar,
  carteira,
  saldoCalculado,
}: {
  aberto: boolean;
  onFechar: () => void;
  carteira: Carteira | null | undefined;
  /** O saldo que a tela mostra agora, para comparar. */
  saldoCalculado: number;
}) {
  const { t } = useLocale();
  const [linhas, setLinhas] = useState<LinhaCarteira[]>([]);
  const [salvando, setSalvando] = useState(false);
  const proxima = useRef(0);
  const nova = (nome: string, valor = ""): LinhaCarteira => ({ chave: proxima.current++, nome, valor });

  useEffect(() => {
    if (!aberto) return;
    setLinhas(
      carteira?.saldos.length
        ? carteira.saldos.map((s) => nova(s.nome, valorParaTexto(s.valor)))
        : [nova(t("lugarPix")), nova(t("lugarDinheiro"))]
    );
    // Só ao abrir: `t` muda de identidade a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, carteira]);

  const preenchidas = linhas.filter((l) => l.valor.trim() !== "");
  const valores = preenchidas.map((l) => lerValor(l.valor));
  const total = valores.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
  const podeSalvar = preenchidas.length > 0 && valores.every(Number.isFinite);

  const mudar = (chave: number, campoMudado: "nome" | "valor", texto: string) =>
    setLinhas((atual) => atual.map((l) => (l.chave === chave ? { ...l, [campoMudado]: texto } : l)));

  const salvar = async () => {
    setSalvando(true);
    const saldos = preenchidas.map((l, i) => ({ nome: l.nome.trim() || t("lugarPix"), valor: valores[i] }));
    const ok = await executar(() => carteiraApi.salvar(saldos), { erro: t("erroAoSalvar"), sucesso: t("saldoSalvo") });
    setSalvando(false);
    if (ok !== null) onFechar();
  };

  const voltarAoAutomatico = async () => {
    setSalvando(true);
    const ok = await executar(() => carteiraApi.remover(), { erro: t("erroAoSalvar") });
    setSalvando(false);
    if (ok !== null) onFechar();
  };

  return (
    <Janela
      aberto={aberto}
      onFechar={onFechar}
      titulo={t("ajustarSaldoTitulo")}
      descricao={t("ajustarSaldoTexto")}
      onSalvar={salvar}
      salvando={salvando}
      podeSalvar={podeSalvar}
      rodapeExtra={
        carteira ? (
          <button
            type="button"
            onClick={voltarAoAutomatico}
            title={t("usarCalculoAutomaticoTexto")}
            className="rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {t("usarCalculoAutomatico")}
          </button>
        ) : undefined
      }
    >
      <div className="space-y-2">
        <div className="grid grid-cols-[minmax(0,1fr)_148px_36px] gap-2 text-xs font-semibold text-muted-foreground">
          <span>{t("lugarNome")}</span>
          <span>{t("financesAmount")}</span>
        </div>
        {linhas.map((l) => (
          <div key={l.chave} className="grid grid-cols-[minmax(0,1fr)_148px_36px] items-center gap-2">
            <Input
              aria-label={t("lugarNome")}
              value={l.nome}
              onChange={(e) => mudar(l.chave, "nome", e.target.value)}
              className={campo}
            />
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
              <Input
                aria-label={`${t("financesAmount")} · ${l.nome}`}
                inputMode="decimal"
                placeholder="0,00"
                value={l.valor}
                onChange={(e) => mudar(l.chave, "valor", e.target.value)}
                className={cn(campo, "pl-10 text-right tabular-nums", l.valor.trim() && !Number.isFinite(lerValor(l.valor)) && "border-destructive")}
              />
            </div>
            <button
              type="button"
              onClick={() => setLinhas((atual) => atual.filter((x) => x.chave !== l.chave))}
              disabled={linhas.length === 1}
              aria-label={t("removerLugar").replace("{nome}", l.nome)}
              className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setLinhas((atual) => [...atual, nova("")])}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-primary hover:bg-primary/10"
        >
          <Plus className="h-4 w-4" /> {t("adicionarLugar")}
        </button>
      </div>

      <div className="flex items-baseline justify-between gap-3 rounded-2xl bg-secondary/70 px-4 py-3">
        <span className="text-sm font-semibold">{t("totalAgora")}</span>
        <span className="text-xl font-bold tabular-nums">{reais(total, { centavos: true })}</span>
      </div>
      {carteira !== undefined && (
        <p className="text-xs text-muted-foreground">
          {t("saldoCalculadoAgora").replace("{valor}", reais(saldoCalculado, { centavos: true }))}
        </p>
      )}
    </Janela>
  );
}

// ----------------------------------------------
// Meta
// ----------------------------------------------

function mesAtual() {
  return dayKey().slice(0, 7);
}

export function MetaDialog({ aberto, onFechar, inicial }: { aberto: boolean; onFechar: () => void; inicial?: Goal }) {
  const { t, locale } = useLocale();
  const [titulo, setTitulo] = useState("");
  const [icone, setIcone] = useState<string | null>(null);
  const [tipo, setTipo] = useState<TipoMeta>("quantidade");
  const [alvo, setAlvo] = useState("");
  const [atual, setAtual] = useState("");
  const [unidade, setUnidade] = useState("");
  const [objetivoTexto, setObjetivoTexto] = useState("");
  const [longo, setLongo] = useState(false);
  const [prazo, setPrazo] = useState(somarMesesAoMes(mesAtual(), 12));
  const [escolhendoIcone, setEscolhendoIcone] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    if (!inicial) {
      setTitulo("");
      setIcone(null);
      setTipo("quantidade");
      setAlvo("");
      setAtual("");
      setUnidade("");
      setObjetivoTexto("");
      setLongo(false);
      setPrazo(somarMesesAoMes(mesAtual(), 12));
      return;
    }
    const v = lerMeta(inicial);
    setTitulo(inicial.title);
    setIcone(inicial.icone ?? null);
    setTipo(v.tipo);
    setAlvo(v.tipo === "porcentagem" ? "" : valorParaTexto(v.alvo));
    setAtual(valorParaTexto(v.atual));
    setUnidade(v.unidade);
    setObjetivoTexto(v.tipo === "porcentagem" ? inicial.target : "");
    setLongo(!v.prazo);
    setPrazo(v.prazo ?? somarMesesAoMes(mesAtual(), 12));
  }, [aberto, inicial]);

  const numAlvo = tipo === "porcentagem" ? 100 : lerNumero(alvo);
  const numAtual = atual.trim() === "" ? 0 : lerNumero(atual);
  const iconeFinal = icone ?? sugerirIcone(titulo);
  const podeSalvar =
    titulo.trim().length > 0 &&
    numAlvo !== null &&
    numAlvo > 0 &&
    numAtual !== null &&
    numAtual >= 0 &&
    (longo || /^\d{4}-\d{2}$/.test(prazo));

  // Como vai ficar, para conferir antes de salvar.
  const previa = useMemo(() => {
    if (!podeSalvar || tipo === "porcentagem") return null;
    const rascunho: Goal = {
      id: "rascunho",
      title: titulo,
      progress: 0,
      target: "",
      deadline: "",
      tipo,
      alvo: numAlvo!,
      atual: numAtual!,
      unidade: unidade.trim(),
      prazo: longo ? null : prazo,
    };
    return lerMeta(rascunho);
  }, [podeSalvar, tipo, titulo, numAlvo, numAtual, unidade, longo, prazo]);
  const textos = useTextosMeta();

  const salvar = async () => {
    if (!podeSalvar) return;
    setSalvando(true);
    const alvoFinal = numAlvo!;
    const atualFinal = tipo === "porcentagem" ? Math.min(100, numAtual!) : numAtual!;
    const prazoFinal = longo ? null : prazo;
    const dados = {
      title: titulo.trim(),
      icone: iconeFinal,
      tipo,
      alvo: alvoFinal,
      atual: atualFinal,
      unidade: tipo === "quantidade" ? unidade.trim() : "",
      prazo: prazoFinal,
      progress: progressoDe(atualFinal, alvoFinal),
      ...textosLegados(
        { tipo, alvo: alvoFinal, unidade: unidade.trim(), prazo: prazoFinal, objetivoTexto },
        locale,
        t("longoPrazo")
      ),
    };
    const ok = await executar(
      async () => {
        if (inicial) await goalsApi.update(inicial.id, dados);
        else await goalsApi.create(dados);
      },
      { erro: inicial ? t("erroAoSalvar") : t("erroAoAdicionar") }
    );
    setSalvando(false);
    if (ok !== null) onFechar();
  };

  const excluir = async () => {
    if (!inicial) return;
    const ok = await executar(() => goalsApi.delete(inicial.id), { erro: t("erroAoExcluir") });
    if (ok !== null) onFechar();
  };

  const tipos: { valor: TipoMeta; rotulo: string; dica: string }[] = [
    { valor: "quantidade", rotulo: t("metaTipoQuantidade"), dica: t("metaTipoQuantidadeDica") },
    { valor: "dinheiro", rotulo: t("metaTipoDinheiro"), dica: t("metaTipoDinheiroDica") },
    { valor: "porcentagem", rotulo: t("metaTipoPorcentagem"), dica: t("metaTipoPorcentagemDica") },
  ];

  const hojeMes = mesAtual();
  const atalhos: { rotulo: string; mes: string | null }[] = [
    { rotulo: t("em3Meses"), mes: somarMesesAoMes(hojeMes, 3) },
    { rotulo: t("em6Meses"), mes: somarMesesAoMes(hojeMes, 6) },
    { rotulo: t("em12Meses"), mes: somarMesesAoMes(hojeMes, 12) },
    { rotulo: t("fimDoAno"), mes: `${hojeMes.slice(0, 4)}-12` },
    { rotulo: t("longoPrazo"), mes: null },
  ];

  return (
    <Janela
      aberto={aberto}
      onFechar={onFechar}
      titulo={inicial ? t("goalsEdit") : t("goalsAdd")}
      onSalvar={salvar}
      salvando={salvando}
      podeSalvar={podeSalvar}
      largura="max-w-lg"
      rodapeExtra={inicial ? <BotaoExcluir rotulo={t("goalsDelete")} onExcluir={excluir} aberto={aberto} /> : undefined}
    >
      <Campo rotulo={t("goalsNamePlaceholder")}>
        <div className="flex gap-2">
          <Popover open={escolhendoIcone} onOpenChange={setEscolhendoIcone}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={t("escolherIcone")}
                title={t("escolherIcone")}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-input bg-background text-[22px] transition-colors hover:bg-secondary"
              >
                {iconeFinal}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[232px] rounded-2xl p-2">
              <div className="grid grid-cols-6 gap-1">
                {ICONES_META.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => {
                      setIcone(e);
                      setEscolhendoIcone(false);
                    }}
                    className={cn("grid h-8 w-8 place-items-center rounded-lg text-lg hover:bg-secondary", e === iconeFinal && "bg-primary/10 ring-1 ring-primary")}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Input autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} className={campo} placeholder={t("exMetaNova")} />
        </div>
      </Campo>

      <div className="space-y-1.5">
        <span className="text-xs font-semibold text-muted-foreground">{t("comoMedir")}</span>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("comoMedir")}>
          {tipos.map((op) => (
            <button
              key={op.valor}
              type="button"
              role="radio"
              aria-checked={tipo === op.valor}
              onClick={() => setTipo(op.valor)}
              className={cn(
                "rounded-2xl border px-2 py-2 text-center transition-colors",
                tipo === op.valor
                  ? "border-primary bg-primary/[0.07] ring-1 ring-primary"
                  : "border-border/80 text-muted-foreground hover:border-primary/40 hover:text-foreground"
              )}
            >
              <span className="block text-[13px] font-semibold text-foreground">{op.rotulo}</span>
              <span className="block text-[10.5px] leading-tight text-muted-foreground">{op.dica}</span>
            </button>
          ))}
        </div>
      </div>

      {tipo === "quantidade" && (
        <div className="grid grid-cols-[1fr_1.3fr_1fr] gap-3">
          <Campo rotulo={t("metaAlvo")}>
            <Input inputMode="decimal" value={alvo} onChange={(e) => setAlvo(e.target.value)} className={campo} placeholder="6" />
          </Campo>
          <Campo rotulo={t("metaUnidade")}>
            <Input value={unidade} onChange={(e) => setUnidade(e.target.value)} className={campo} placeholder={t("exUnidade")} />
          </Campo>
          <Campo rotulo={t("metaJaTenho")}>
            <Input inputMode="decimal" value={atual} onChange={(e) => setAtual(e.target.value)} className={campo} placeholder="0" />
          </Campo>
        </div>
      )}
      {tipo === "dinheiro" && (
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo={t("metaQuantoJuntar")}>
            <Input inputMode="decimal" value={alvo} onChange={(e) => setAlvo(e.target.value)} className={campo} placeholder="R$ 30.000" />
          </Campo>
          <Campo rotulo={t("metaJaGuardei")}>
            <Input inputMode="decimal" value={atual} onChange={(e) => setAtual(e.target.value)} className={campo} placeholder="R$ 0" />
          </Campo>
        </div>
      )}
      {tipo === "porcentagem" && (
        <div className="grid grid-cols-[1.6fr_1fr] gap-3">
          <Campo rotulo={t("objetivo")}>
            <Input value={objetivoTexto} onChange={(e) => setObjetivoTexto(e.target.value)} className={campo} placeholder={t("exObjetivoLivre")} />
          </Campo>
          <Campo rotulo={t("metaJaAvancei")}>
            <Input inputMode="numeric" value={atual} onChange={(e) => setAtual(e.target.value)} className={campo} placeholder="0" />
          </Campo>
        </div>
      )}

      <div className="space-y-1.5">
        <span className="text-xs font-semibold text-muted-foreground">{t("goalsDeadlinePlaceholder")}</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {atalhos.map((a) => {
            const ativo = a.mes === null ? longo : !longo && prazo === a.mes;
            return (
              <button
                key={a.rotulo}
                type="button"
                aria-pressed={ativo}
                onClick={() => {
                  if (a.mes === null) setLongo(true);
                  else {
                    setLongo(false);
                    setPrazo(a.mes);
                  }
                }}
                className={cn(
                  "h-9 rounded-xl px-3 text-xs font-semibold transition-colors",
                  ativo ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/70"
                )}
              >
                {a.rotulo}
              </button>
            );
          })}
          <Input
            type="month"
            aria-label={t("escolherMes")}
            value={longo ? "" : prazo}
            min={hojeMes}
            onChange={(e) => {
              if (!e.target.value) return;
              setLongo(false);
              setPrazo(e.target.value);
            }}
            className="h-9 w-[150px] rounded-xl bg-background text-sm"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {longo ? t("longoPrazoDica") : t("metaAte").replace("{mes}", mesCurto(prazo, locale))}
        </p>
      </div>

      {previa && (
        <div className="flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/[0.05] px-4 py-3 text-sm" aria-live="polite">
          <span className="text-2xl leading-none" aria-hidden>
            {iconeFinal}
          </span>
          <span className="min-w-0">
            <span className="block font-semibold">
              {textos.quanto(previa)} · {previa.pct}%
            </span>
            <span className="block text-xs text-muted-foreground">{textos.ritmo(previa) || textos.prazo(previa)}</span>
          </span>
        </div>
      )}
    </Janela>
  );
}

// ----------------------------------------------
// Confirmação de exclusão
// ----------------------------------------------

export function Confirmar({
  aberto,
  titulo,
  descricao,
  onConfirmar,
  onFechar,
}: {
  aberto: boolean;
  titulo: string;
  descricao?: string;
  onConfirmar: () => void;
  onFechar: () => void;
}) {
  const { t } = useLocale();
  return (
    <AlertDialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <AlertDialogContent className="max-w-sm rounded-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          {descricao && <AlertDialogDescription>{descricao}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-xl">{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              onConfirmar();
              onFechar();
            }}
          >
            {t("delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
