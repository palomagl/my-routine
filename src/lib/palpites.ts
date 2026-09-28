// Palpite de categoria pelo texto do gasto: "Mercado" -> Alimentação,
// "Uber" -> Transporte... A pessoa pode trocar; o palpite só evita ter que
// escolher toda vez. Puro (sem Firebase), para dar para testar.

import type { CategoriaTransacao } from "@/lib/db";

const PALPITES: [RegExp, CategoriaTransacao][] = [
  // Antes de "Assinaturas": o Claude e o notebook são para estudar.
  [/claude|chatgpt|udemy|alura|coursera|livro|apostila|caderno|material escolar|matr[ií]cula|notebook|laptop/i, "Estudos"],
  [/netflix|spotify|prime video|disney|youtube premium|assinatura|icloud|hbo|deezer|globoplay/i, "Assinaturas"],
  [/mercado|supermercado|padaria|ifood|restaurante|lanche|almo[cç]o|janta|caf[eé]|pizza|hamb[uú]rguer|a[cç]ougue|feira|comida|sorvete|doce/i, "Alimentação"],
  [/uber|\b99\b|[oô]nibus|gasolina|combust[ií]vel|posto|estacionamento|passagem|metr[oô]|trem|ped[aá]gio|t[aá]xi/i, "Transporte"],
  [/aluguel|condom[ií]nio|\bluz\b|energia|[aá]gua|\bg[aá]s\b|internet|iptu/i, "Moradia"],
  [/farm[aá]cia|rem[eé]dio|m[eé]dic|consulta|dentista|academia|exame|psic[oó]log/i, "Saúde"],
  [/cinema|show|jogo|passeio|viagem|festa|\bbar\b|balada|ingresso/i, "Lazer"],
  // Por último: "uber pra faculdade" é transporte, "lanche na escola" é comida.
  [/curso|faculdade|escola|estud|ingl[eê]s|idioma|prova|aula/i, "Estudos"],
];

export function sugerirCategoria(descricao: string): CategoriaTransacao | null {
  return PALPITES.find(([re]) => re.test(descricao))?.[1] ?? null;
}
