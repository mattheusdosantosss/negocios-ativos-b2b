// ============================================================
// Meta de Logística (B2B) — soma de "Valor final de comissão PSA"
// (valor_final_de_comissao_psa) dos TICKETS cuja "Data de Emissão"
// (data_de_emissao) cai no mês corrente. Espelha o relatório do HubSpot
// (mesma propriedade, mesmo recorte) — sem filtro de pipeline, igual ao relatório.
// data_de_emissao é propriedade DATE (meia-noite UTC), então o mês usa limites UTC.
// ============================================================
import { hsFetch, sleep, dealUrl, ticketUrl, ownerDisplayName, fetchAssocIds, type Owner, type LogisticaSale } from "./hubspot";

export type LogisticaCloser = { ownerId: string; name: string; total: number; count: number; sales: LogisticaSale[] };

/**
 * Logística por closer (= dono do negócio associado) no mês de `from` (ou mês
 * corrente), por Data de Emissão. Mesma atribuição de Vendas do Dia (ticket →
 * negócio → dono). Tickets sem negócio ficam de fora (não têm closer).
 */
export async function fetchLogisticaByCloser(opts: { from?: string; to?: string }, owners: Map<string, Owner>): Promise<Map<string, LogisticaCloser>> {
  const ref = opts.from ? new Date(opts.from + "T00:00:00Z") : new Date();
  const startMs = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1);
  const endMs = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 1) - 1;

  const tickets: { id: string; bruto: number; liquido: number; cliente: string }[] = [];
  let after: string | undefined;
  do {
    const body: Record<string, unknown> = {
      filterGroups: [{ filters: [
        { propertyName: "hs_pipeline", operator: "EQ", value: "751582050" },
        { propertyName: "data_de_emissao", operator: "GTE", value: String(startMs) },
        { propertyName: "data_de_emissao", operator: "LTE", value: String(endMs) },
      ] }],
      properties: ["valor_total_nd__nota_de_debito__ou_nf__nota_fiscal_", "valor_total_da_comissao_psa", "subject"],
      limit: 200,
    };
    if (after) body.after = after;
    const r = await hsFetch<{ results?: { id: string; properties: Record<string, string> }[]; paging?: { next?: { after?: string } } }>(
      `/crm/v3/objects/tickets/search`, { method: "POST", body: JSON.stringify(body) }
    );
    for (const t of r.results ?? []) {
      // Líquido = comissão PSA; Bruto = valor total da logística (ND/NF).
      const liquido = Number(t.properties.valor_total_da_comissao_psa || 0);
      const bruto = Number(t.properties.valor_total_nd__nota_de_debito__ou_nf__nota_fiscal_ || 0) || liquido;
      if (liquido > 0) tickets.push({ id: t.id, bruto, liquido, cliente: t.properties.subject || `Ticket ${t.id}` });
    }
    after = r.paging?.next?.after;
    if (after) await sleep(120);
  } while (after);

  const assoc = await fetchAssocIds("tickets", "deals", tickets.map((t) => t.id));
  const dealIds = [...new Set([...assoc.values()].flat())];
  const ownerByDeal = new Map<string, string>();
  for (let i = 0; i < dealIds.length; i += 100) {
    const chunk = dealIds.slice(i, i + 100);
    const res = await hsFetch<{ results?: { id: string; properties: Record<string, string> }[] }>(
      `/crm/v3/objects/deals/batch/read`,
      { method: "POST", body: JSON.stringify({ properties: ["hubspot_owner_id"], inputs: chunk.map((id) => ({ id })) }) }
    );
    for (const d of res.results ?? []) ownerByDeal.set(d.id, d.properties.hubspot_owner_id || "");
    if (i + 100 < dealIds.length) await sleep(120);
  }

  const byOwner = new Map<string, LogisticaCloser>();
  for (const t of tickets) {
    const did = (assoc.get(t.id) ?? [])[0];
    const oid = did ? ownerByDeal.get(did) : "";
    if (!oid) continue; // órfão (sem negócio) não entra em nenhum closer
    let c = byOwner.get(oid);
    if (!c) { c = { ownerId: oid, name: ownerDisplayName(owners.get(oid)) || oid, total: 0, count: 0, sales: [] }; byOwner.set(oid, c); }
    c.total += t.liquido;
    c.count += 1;
    c.sales.push({ cliente: t.cliente, liquido: t.liquido, bruto: t.bruto, url: did ? dealUrl(did) : ticketUrl(t.id) });
  }
  for (const c of byOwner.values()) c.sales.sort((a, b) => b.liquido - a.liquido);
  return byOwner;
}

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
