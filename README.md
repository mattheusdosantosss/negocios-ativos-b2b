# Negócios Ativos

Painel enxuto, no padrão visual da **PSA**, para visualizar os **negócios
ativos** de closers no HubSpot, por **Closer** (proprietário do negócio).

Tem duas abas, cada uma numa pipeline distinta:

- **B2B** — pipeline "Funil de Vendas B2B" (`default`)
- **B2C** — pipeline "Funil de Vendas B2C" (`725182862`)

Toda a config por segmento (etapas ativas, etapas de temperatura, etapas de
ganho, checkout e roster de closers) fica em `lib/segments.ts`. O seletor de
aba na UI troca o `?segment=b2b|b2c` da API; o resto do código é agnóstico.

**B2B** — 5 etapas ativas (Reunião agendada/Qualificado, Proposta enviada | 1°
Follow, Em negociação, Negociação avançada, Resting).

> Nessa pipeline os IDs internos `closedwon`/`closedlost` foram renomeados
> pelo negócio para "Proposta enviada"/"Em negociação" — **não** são os
> estágios terminais de ganho/perda do HubSpot, apenas reaproveitam esses IDs
> internos.

**B2C** — 4 etapas ativas (até "Negociação avançada") + um **bloco de checkout**
à parte ("Aguardando pagamento", "Pagamento realizado"), que não entra no total
de ativos. Ganho terminal = "Ganho" (`1105295876`).

Mostra, por closer: quantidade de negócios em cada etapa, total de negócios
ativos e valor total em aberto — além dos KPIs gerais, temperatura/convicção,
forecast e o ticket médio de ganho.

Sem `HUBSPOT_TOKEN` o painel renderiza com um **snapshot real** (`lib/seed.ts`,
capturado em 09/07/2026). Com o token, fica **ao vivo**.

## Rodar local

```bash
npm install
cp .env.example .env.local   # preencha o HUBSPOT_TOKEN
npm run dev
```

## Deploy na Vercel

1. Suba este projeto no repo `negocios-ativos-b2b`.
2. Na Vercel: New Project → importe o repo.
3. Em **Settings → Environment Variables**, adicione:
   - `HUBSPOT_TOKEN` = token de Private App (scopes: `crm.objects.deals.read`,
     `crm.objects.owners.read`).
   - `HUBSPOT_PIPELINE_B2B` (opcional) = ID da pipeline, default `default`.
4. Deploy.

Sem login — painel de visualização aberta.

## Onde cada coisa fica

- `lib/segments.ts` — config por segmento (B2B/B2C): pipeline, etapas ativas,
  etapas de temperatura, etapas de ganho, checkout e roster.
- `lib/team.ts` — rosters oficiais de closers (`B2B_TEAM`, `B2C_TEAM`).
- `lib/hubspot.ts` — cliente HubSpot; busca ativos/checkout/ganhos e owners,
  recebendo o `SegmentConfig` por parâmetro (agnóstico a B2B/B2C).
- `lib/aggregate.ts` — agrupa os negócios por closer e soma os totais.
- `lib/seed.ts` — snapshots de exemplo por segmento (fallback sem token).
- `app/api/dashboard/route.ts` — rota que lê `?segment=`, busca/agrega e devolve o JSON.
- `app/page.tsx` + `components/` — UI (seletor de aba, KPIs, checkout, temperatura).
