// Snapshot real do HubSpot (pipeline "Funil de Vendas B2B") capturado em
// 09/07/2026, usado como fallback quando HUBSPOT_TOKEN não está configurado
// (dev local sem env, ou preview). Com o token, o painel fica ao vivo.

import { STAGES } from "./hubspot";
import type { CloserRow, DashboardData } from "./aggregate";

// porEtapa/valorPorEtapa seguem a ordem de STAGES:
// [Conexão, Reunião agendada/Qualificado, Aguardando Envio de Proposta,
//  Proposta enviada, Em negociação, Negociação avançada, Resting]
const STAGE_IDS = STAGES.map((s) => s.id);

function row(ownerId: string, nome: string, counts: number[], valores: number[]): CloserRow {
  return {
    ownerId,
    nome,
    porEtapa: Object.fromEntries(STAGE_IDS.map((id, i) => [id, counts[i]])),
    valorPorEtapa: Object.fromEntries(STAGE_IDS.map((id, i) => [id, valores[i]])),
    total: counts.reduce((a, b) => a + b, 0),
    valor: valores.reduce((a, b) => a + b, 0),
  };
}

const closers: CloserRow[] = [
  row("80454586", "Rafael Teixeira", [6, 10, 1, 28, 38, 2, 13], [18390, 21300, 3799, 147138, 240639.9, 27299, 48508]),
  row("80651489", "Catarina Varoni Borges", [0, 5, 0, 14, 25, 4, 36], [0, 6320, 0, 82899, 127706.1, 306998, 214237.1]),
  row("80454588", "João Gabriel Marins Pereira", [0, 4, 4, 24, 32, 5, 20], [0, 1000, 6450, 137730, 208687, 14898, 102228]),
  row("86859895", "Mateus Mariano", [5, 10, 0, 7, 41, 1, 9], [9660, 21655, 0, 70099.7, 271031.4, 3950, 21120]),
  row("87159365", "João Lucas Backmann", [1, 31, 1, 6, 17, 1, 8], [0, 31800, 0, 36200, 91025, 8750, 25400]),
  row("80169395", "Lucas Oliveira", [0, 6, 1, 36, 5, 0, 7], [0, 0, 0, 183515, 40220, 0, 34570]),
  row("92704130", "Talita Santos Cruz", [0, 10, 2, 14, 12, 0, 3], [0, 8360, 8450, 69215, 86634.9, 0, 11000]),
  row("80454576", "Eduardo Vince", [0, 1, 0, 7, 10, 0, 0], [0, 0, 0, 43845, 55400, 0, 0]),
  row("79760745", "Thiago Berto", [1, 5, 0, 0, 0, 1, 0], [0, 10885, 0, 0, 0, 8408, 0]),
  row("81033487", "Owner 81033487", [0, 7, 0, 0, 0, 0, 0], [0, 14970, 0, 0, 0, 0, 0]),
  row("87074298", "Owner 87074298", [0, 6, 0, 0, 0, 0, 0], [0, 14000, 0, 0, 0, 0, 0]),
  row("80454577", "Daniel Bento Sias", [0, 3, 0, 0, 0, 1, 0], [0, 1000, 0, 0, 0, 5950, 0]),
  row("80454582", "Katyeli Ceroni Madril", [0, 1, 0, 1, 0, 0, 0], [0, 0, 0, 28800, 0, 0, 0]),
].sort((a, b) => b.total - a.total || b.valor - a.valor);

const totals = {
  total: closers.reduce((s, c) => s + c.total, 0),
  valor: closers.reduce((s, c) => s + c.valor, 0),
  porEtapa: Object.fromEntries(
    STAGE_IDS.map((id) => [id, closers.reduce((s, c) => s + c.porEtapa[id], 0)])
  ),
};

export const SEED_DATA: DashboardData = {
  meta: { updatedAt: "2026-07-09T12:00:00.000Z", usingLiveData: false },
  stages: STAGES,
  totals,
  closers,
};
