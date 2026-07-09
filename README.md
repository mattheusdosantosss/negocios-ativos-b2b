# Negócios Ativos B2B

Painel enxuto, no padrão visual da **PSA**, para visualizar os **negócios
ativos** na pipeline **Funil de Vendas B2B** do HubSpot, por **Closer**
(proprietário do negócio).

Snapshot ao vivo (sem filtro de período) das 7 etapas ativas do funil:

| Etapa (rótulo no HubSpot)             | ID interno            |
| -------------------------------------- | ---------------------- |
| Conexão                                | `presentationscheduled` |
| Reunião agendada / Qualificado         | `decisionmakerboughtin` |
| Aguardando Envio de Proposta           | `contractsent`          |
| Proposta enviada                       | `closedwon`             |
| Em negociação                          | `closedlost`            |
| Negociação avançada                    | `1167445770`            |
| Resting                                | `1367665802`            |

> Nessa pipeline os IDs internos `closedwon`/`closedlost` foram renomeados
> pelo negócio para "Proposta enviada"/"Em negociação" — **não** são os
> estágios terminais de ganho/perda do HubSpot, apenas reaproveitam esses IDs
> internos. Confirmado direto no HubSpot (Deal Stage → opções da pipeline
> "Funil de Vendas B2B" = `default`).

Mostra, por closer: quantidade de negócios em cada etapa, total de negócios
ativos e valor total em aberto — além dos KPIs gerais e um funil por etapa.

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

- `lib/hubspot.ts` — cliente HubSpot, etapas da pipeline (`STAGES`), busca de
  negócios ativos e owners.
- `lib/aggregate.ts` — agrupa os negócios por closer e soma os totais.
- `lib/seed.ts` — snapshot de exemplo (fallback sem token).
- `app/api/dashboard/route.ts` — rota que busca/agrega e devolve o JSON.
- `app/page.tsx` + `components/` — UI (KPIs, funil por etapa, tabela por closer).
