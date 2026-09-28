import {
  ArrowUpToLine,
  BookOpen,
  Car,
  Coffee,
  Droplet,
  Dumbbell,
  Ellipsis,
  GraduationCap,
  HeartPulse,
  Home,
  Leaf,
  Moon,
  Repeat,
  ShoppingBasket,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import { CATEGORIAS_TRANSACAO, type CategoriaTransacao } from "@/lib/db";
import { useTema } from "@/hooks/useTema";
import type { TranslationKey } from "@/lib/translations";

// ----------------------------------------------
// Cores dos gráficos
// ----------------------------------------------
// Validadas com o validador de paleta (daltonismo e contraste), em claro e
// escuro. A ordem é a de CATEGORIAS_TRANSACAO e não muda com os dados: uma
// categoria tem sempre a mesma cor, em qualquer gráfico. "Outros" é cinza
// de propósito — é a sobra, não uma categoria de verdade. "Estudos" (ameixa)
// foi a última a entrar: é a cor mais distante de todas as outras, com e sem
// daltonismo, nos dois temas.

const CORES_CATEGORIA: Record<CategoriaTransacao, [claro: string, escuro: string]> = {
  "Alimentação": ["#14a88f", "#12a189"],
  "Transporte": ["#7c6cf0", "#8577f0"],
  "Moradia": ["#f08c2e", "#d4731c"],
  "Lazer": ["#3b82f6", "#3f86f2"],
  "Saúde": ["#e8618c", "#dc4f7c"],
  "Assinaturas": ["#d9a400", "#b58800"],
  "Estudos": ["#8f208f", "#aa38ad"],
  "Outros": ["#94a3b8", "#7b8797"],
};

/** Séries fixas: entradas x gastos, tarefas x hábitos. */
const CORES_SERIE = {
  entradas: ["#7c6cf0", "#8577f0"],
  gastos: ["#e8618c", "#dc4f7c"],
  saldo: ["#14a88f", "#12a189"],
  tarefas: ["#14a88f", "#12a189"],
  habitos: ["#7c6cf0", "#8577f0"],
  metas: ["#e8a317", "#c98a0c"],
} as const;

export type Serie = keyof typeof CORES_SERIE;

export function useCores() {
  const { escuro } = useTema();
  const i = escuro ? 1 : 0;
  return {
    escuro,
    categoria: (c: string | undefined) => CORES_CATEGORIA[normalizarCategoria(c)][i],
    serie: (s: Serie) => CORES_SERIE[s][i],
    /** Trilho de barras e aros vazios. */
    trilho: escuro ? "hsl(200 16% 18%)" : "hsl(160 16% 93%)",
    grade: escuro ? "hsl(200 14% 17%)" : "hsl(165 14% 92%)",
    eixo: escuro ? "hsl(200 8% 58%)" : "hsl(205 10% 50%)",
    superficie: escuro ? "hsl(200 22% 10%)" : "#ffffff",
  };
}

export function normalizarCategoria(c: string | undefined): CategoriaTransacao {
  return (CATEGORIAS_TRANSACAO as readonly string[]).includes(c ?? "") ? (c as CategoriaTransacao) : "Outros";
}

export const ICONE_CATEGORIA: Record<CategoriaTransacao, LucideIcon> = {
  "Alimentação": ShoppingBasket,
  "Transporte": Car,
  "Moradia": Home,
  "Lazer": Ticket,
  "Saúde": HeartPulse,
  "Assinaturas": Repeat,
  "Estudos": GraduationCap,
  "Outros": Ellipsis,
};

export const ICONE_ENTRADA = ArrowUpToLine;

// ----------------------------------------------
// Tarefas
// ----------------------------------------------

export const CATEGORIAS_TAREFA = ["Trabalho", "Saúde", "Estudos", "Bem-estar", "Casa", "Geral"] as const;

export const ROTULO_TAREFA: Record<string, TranslationKey> = {
  Trabalho: "categoryWork",
  Saúde: "categoryHealth",
  Estudos: "categoryStudy",
  "Bem-estar": "categoryWellbeing",
  Casa: "categoryHome",
  Geral: "categoryGeneral",
};

/** Etiqueta colorida da tarefa (fundo suave + texto num tom mais escuro, legível). */
export const ETIQUETA_TAREFA: Record<string, string> = {
  Trabalho: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  Saúde: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  Estudos: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  "Bem-estar": "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  Casa: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  Geral: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
};

// ----------------------------------------------
// Hábitos (mesmos ícones do celular)
// ----------------------------------------------

export const ICONES_HABITO: Record<string, LucideIcon> = {
  Droplet,
  Dumbbell,
  BookOpen,
  Moon,
  Coffee,
  Leaf,
};

export const OPCOES_ICONE_HABITO = ["Droplet", "Dumbbell", "BookOpen", "Moon", "Coffee", "Leaf"];
