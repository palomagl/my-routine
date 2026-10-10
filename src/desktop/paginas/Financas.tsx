import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { ArrowDownToLine, ArrowUpToLine, Eye, EyeOff, Target, Wallet } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { useMetas, useTransacoes } from "@/lib/aoVivo";
import { dayKey, lastNDays } from "@/lib/dates";
import { Cabecalho, IconePagina } from "../Cabecalho";
import { useCores } from "../categorias";
import { somaPorDia, totaisDoMes, variacao, type Periodo } from "../calculos";
import { mesAnterior } from "../formato";
import { Delta, Kpi } from "../graficos";
import { Barra, Sparkline } from "../ui";
import { useDinheiro, useValores } from "../valores";
import { CategoriasCard, EntradasGastosCard, MetasCard } from "../cards/FinancasCards";
import { ContasCard } from "../cards/Contas";
import { SaldoKpi } from "../cards/Saldo";
import { LancarRapido } from "../cards/Lancar";
import { TransacoesCard } from "../cards/Transacoes";
import { TelegramFaixa } from "../cards/Extras";
import { Cartoes } from "@/components/financas/Cartoes";

function Kpis() {
  const { t } = useLocale();
  const cores = useCores();
  const dinheiro = useDinheiro();
  const { ocultos, alternar } = useValores();
  const transacoes = useTransacoes().itens;
  const metas = useMetas().itens;

  const d = useMemo(() => {
    const mes = dayKey().slice(0, 7);
    const atual = totaisDoMes(transacoes, mes);
    const anterior = totaisDoMes(transacoes, mesAnterior(mes));
    const dias = lastNDays(30);
    return {
      entradas: atual.entradas,
      gastos: atual.gastos,
      varEntradas: variacao(atual.entradas, anterior.entradas),
      varGastos: variacao(atual.gastos, anterior.gastos),
      serieEntradas: somaPorDia(transacoes, dias, "income"),
      serieGastos: somaPorDia(transacoes, dias, "expense"),
    };
  }, [transacoes]);

  const concluidas = metas.filter((m) => m.progress >= 100).length;
  const vsMes = ` ${t("vsMesPassado")}`;

  return (
    <div className="grid grid-cols-4 gap-4 wide:gap-5">
      <SaldoKpi
        rotulo={t("saldoAtual")}
        acaoExtra={
          <button
            type="button"
            onClick={alternar}
            aria-label={ocultos ? t("valoresMostrar") : t("valoresOcultar")}
            title={ocultos ? t("valoresMostrar") : t("valoresOcultar")}
            className="-my-1 grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            {ocultos ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        }
      />
      <Kpi
        atraso={50}
        Icone={ArrowUpToLine}
        cor={cores.serie("entradas")}
        rotulo={t("entradasDoMes")}
        valor={dinheiro(d.entradas)}
        rodape={<Delta pct={d.varEntradas} bomQuandoSobe sufixo={vsMes} />}
        grafico={<Sparkline valores={d.serieEntradas} cor={cores.serie("entradas")} largura={64} altura={30} className="w-[52px] wide:w-16" />}
      />
      <Kpi
        atraso={100}
        Icone={ArrowDownToLine}
        cor={cores.serie("gastos")}
        rotulo={t("gastosDoMes")}
        valor={dinheiro(d.gastos)}
        rodape={<Delta pct={d.varGastos} bomQuandoSobe={false} sufixo={vsMes} />}
        grafico={<Sparkline valores={d.serieGastos} cor={cores.serie("gastos")} largura={64} altura={30} className="w-[52px] wide:w-16" />}
      />
      <Kpi
        atraso={150}
        Icone={Target}
        cor={cores.serie("metas")}
        rotulo={t("metasTitulo")}
        valor={
          <>
            {concluidas}
            <span className="text-base font-semibold text-muted-foreground">/{metas.length}</span>
          </>
        }
        rodape={
          <div className="w-full">
            <Barra pct={metas.length ? (concluidas / metas.length) * 100 : 0} cor={cores.serie("metas")} />
            <span className="mt-1.5 block text-muted-foreground">{t("metasConcluidas")}</span>
          </div>
        }
      />
    </div>
  );
}

export default function FinancasDesktop() {
  const { t } = useLocale();
  const { hash } = useLocation();
  const [periodo, setPeriodo] = useState<Periodo>("30d");

  // "Ver detalhes" das metas na Início leva para /financas#metas.
  useEffect(() => {
    if (!hash) return;
    const alvo = document.getElementById(hash.slice(1));
    if (alvo) setTimeout(() => alvo.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
  }, [hash]);

  return (
    <>
      <Cabecalho icone={<IconePagina Icone={Wallet} />} titulo={t("tabFinancas")} subtitulo={t("financasSubtitulo")} />

      <div className="space-y-4 wide:space-y-5">
        <LancarRapido />
        <Kpis />
        <div className="grid grid-cols-12 gap-4 wide:gap-5">
          <div className="col-span-7 grid min-w-0">
            <EntradasGastosCard periodo={periodo} onPeriodo={setPeriodo} />
          </div>
          <div className="col-span-5 grid min-w-0">
            <CategoriasCard periodo={periodo} />
          </div>
        </div>
        <div className="grid grid-cols-2 items-stretch gap-4 wide:gap-5">
          <TransacoesCard />
          <MetasCard />
        </div>
        <ContasCard />
        <Cartoes />
        <TelegramFaixa />
      </div>
    </>
  );
}
