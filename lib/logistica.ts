// ============================================================
// Meta de Logística (B2B) — soma de "Valor final de comissão PSA"
// (valor_final_de_comissao_psa) dos TICKETS cuja "Data de Emissão"
// (data_de_emissao) cai no mês corrente. Espelha o relatório do HubSpot
// (mesma propriedade, mesmo recorte) — sem filtro de pipeline, igual ao relatório.
// data_de_emissao é propriedade DATE (meia-noite UTC), então o mês usa limites UTC.
// ============================================================
import { hsFetch, sleep } from "./hubspot";

export async function fetchLogisticaComissao(): Promise<{ sold: number; count: number }> {
  const now = new Date();
  const startMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const endMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - 1;

  let sold = 0;
  let count = 0;
  let after: string | undefined;
  do {
    const body: Record<string, unknown> = {
      filterGroups: [{ filters: [
        { propertyName: "data_de_emissao", operator: "GTE", value: String(startMs) },
        { propertyName: "data_de_emissao", operator: "LTE", value: String(endMs) },
      ] }],
      properties: ["valor_final_de_comissao_psa"],
      limit: 200,
    };
    if (after) body.after = after;
    const r = await hsFetch<{ results?: { properties: Record<string, string> }[]; paging?: { next?: { after?: string } } }>(
      `/crm/v3/objects/tickets/search`,
      { method: "POST", body: JSON.stringify(body) }
    );
    for (const t of r.results ?? []) {
      const v = Number(t.properties.valor_final_de_comissao_psa || 0);
      if (v) { sold += v; count += 1; }
    }
    after = r.paging?.next?.after;
    if (after) await sleep(120);
  } while (after);

  return { sold, count };
}
