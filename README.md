# WMS — Warehouse Management System

[🇧🇷 Português](./README.PT-BR.md)

A web-based warehouse management system built to solve a real inventory divergence problem in a mid-size retail store. The system replaces manual paper-based stock counting with mobile barcode scanning, providing real-time divergence tracking and an immutable audit trail.

## Problem

Retail stores frequently discover inventory discrepancies only during annual audits or when a customer tries to purchase a product that no longer exists on the shelf. This system implements rotating inventory sessions with mobile scanning, replacing the manual paper process and eliminating the main causes of stock divergence.

## Stack

- **Backend:** Node.js · TypeScript · Express · Knex · SQLite
- **Frontend:** React · Vite · TypeScript · Tailwind CSS v4 · Recharts
- **Auth:** JWT with RBAC (ADMIN / OPERATOR roles)

## Features

- Product base import via CSV/Excel exported from ERP
- Stock movement registration (Warehouse → Shelf) with barcode scanning
- Rotating inventory with blind count mode to eliminate human bias
- Divergence threshold with automatic blocking and mandatory justification
- Real-time dashboard with weekly movement chart
- Mobile-friendly PWA — operators use it on their phones without installing anything

## Security highlights

- `BEGIN IMMEDIATE` transactions on SQLite to eliminate TOCTOU race conditions
- Cross-service integration guard between movement and inventory services (IC1)
- Append-only audit trail with immutable snapshot in `inventory_session_results`
- Idempotency key against duplicate scans in unstable Wi-Fi environments
- OWASP Top 10 audit applied with documented fixes

## Getting started

```bash
# Backend
cd backend
cp .env.example .env   # fill in JWT_SECRET and divergence thresholds
npm install
npm run seed           # runs migrations and imports sample products
npm run dev

# Frontend
cd frontend
npm install
npm run dev
```

### Environment variables

| Variable | Description | Default |
|---|---|---|
| `JWT_SECRET` | Secret key for token signing | required |
| `JWT_EXPIRES_IN` | Token expiration | `8h` |
| `DIVERGENCE_PCT_THRESHOLD` | Max divergence % before blocking session close | `Infinity` (off) |
| `DIVERGENCE_ABS_THRESHOLD` | Max absolute divergence before blocking session close | `Infinity` (off) |

## Project structure

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
