# WMS — Sistema de Gestão de Estoque

[🇺🇸 English](./README.md)

Sistema web de gestão de estoque construído para resolver um problema real de divergência de inventário em uma loja de varejo de médio porte. O sistema substitui a contagem manual em papel por bipagem mobile de código de barras, com rastreamento de divergências em tempo real e trilha de auditoria imutável.

## Problema

Lojas de varejo frequentemente descobrem divergências de estoque apenas no balanço anual ou quando o cliente tenta comprar um produto que não existe mais na prateleira. Este sistema implementa inventário rotativo com bipagem mobile, substituindo o processo manual em papel e eliminando as principais causas de divergência.

## Stack

- **Backend:** Node.js · TypeScript · Express · Knex · SQLite
- **Frontend:** React · Vite · TypeScript · Tailwind CSS v4 · Recharts
- **Auth:** JWT com RBAC (roles ADMIN / OPERADOR)

## Funcionalidades

- Import de base de produtos via CSV/Excel exportado do ERP
- Registro de movimentações (Depósito → Gôndola) com bipagem por código de barras
- Inventário rotativo com modo de contagem cega para eliminar viés humano
- Threshold de divergência com bloqueio automático e justificativa obrigatória
- Dashboard em tempo real com gráfico de movimentações semanais
- PWA responsivo — operadores usam no celular sem instalar nada

## Destaques de segurança

- Transações `BEGIN IMMEDIATE` no SQLite para eliminar race conditions TOCTOU
- Guard de integração entre serviços de movimentação e inventário (IC1)
- Audit trail append-only com snapshot imutável em `inventory_session_results`
- Chave de idempotência contra bipes duplicados em ambiente de Wi-Fi instável
- Auditoria OWASP Top 10 aplicada com correções documentadas

## Como rodar

```bash
# Backend
cd backend
cp .env.example .env   # preencha JWT_SECRET e os thresholds de divergência
npm install
npm run seed           # roda migrations e importa produtos de exemplo
npm run dev

# Frontend
cd frontend
npm install
npm run dev
```

### Variáveis de ambiente

| Variável | Descrição | Padrão |
|---|---|---|
| `JWT_SECRET` | Chave secreta para assinatura dos tokens | obrigatório |
| `JWT_EXPIRES_IN` | Expiração do token | `8h` |
| `DIVERGENCE_PCT_THRESHOLD` | Divergência % máxima antes de bloquear fechamento | `Infinity` (desligado) |
| `DIVERGENCE_ABS_THRESHOLD` | Divergência absoluta máxima antes de bloquear fechamento | `Infinity` (desligado) |

## Estrutura do projeto

```
WMS/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── routes/
│   │   ├── middlewares/
│   │   ├── database/
│   │   │   └── migrations/
│   │   └── utils/
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   ├── layouts/
│   │   └── lib/
│   └── package.json
└── docs/
```
