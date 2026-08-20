# WMS — Project Context Memory

> **Instruction for the AI:** Read this entire file before any response. It contains the business context, critical rules, stack, and code patterns that define this project. Never assume anything that contradicts what is here.

---

## 1. Business Context

### Application Scenario
- **Sector:** retail — building materials and home improvement
- **System:** WMS — **complementary** logistics support system (does not replace the main ERP)

### The Warehouse
- **Small/medium-sized** warehouse with high merchandise turnover
- Predominantly **overhead and dynamic** stock: products stored on high shelves, floating positions (non-fixed addressing by nature)
- Operated by a lean team; manual processes are common today
- **No direct ERP integration** in the current phase — all data entry happens via **CSV/Excel import** or manual entry

### System Goal
Digitize and provide visibility into the inventory management process, focused on:
1. **Addressing** products (where each SKU is physically located)
2. **Rotating counts** (replacing paper and partial inventory spreadsheets)
3. **Divergence alerts** (difference between system balance vs. physical count)
4. **Traceability** of movements (inbound, outbound, transfers between locations)

---

## 2. Critical Business Rules

### 2.1 Flexible and Multiple Addressing
- A product (SKU) **can exist in multiple locations simultaneously** (e.g., Aisle A / Shelf 3 AND Aisle C / Shelf 1)
- A location **can hold multiple SKUs**
- Locations follow the pattern: `AISLE-MODULE-LEVEL-POSITION` (e.g., `A-01-3-P2`)
- The system must allow **creating, editing, and deactivating** locations without losing history
- Movements between locations generate a **transfer record** with timestamp and responsible user

### 2.2 Rotating Counts
- Fully replace paper: the operator uses the web interface (mobile-friendly) to record counts
- A **count session** has a state machine: `OPEN → IN_PROGRESS → PENDING_REVIEW → CLOSED`
- Each counted item generates a record with: SKU, location, counted quantity, user, timestamp
- The same location/SKU can be counted more than once in the same session (recount), generating a history
- Counting **does not automatically change the balance** — it generates a **divergence entry** pending supervisor approval

### 2.3 Divergence Alerts
- Divergence = difference between `system_balance` and `counted_quantity`
- Every divergence is classified by severity:
  - `OK`: difference = 0
  - `WARNING`: difference between 1% and 5% of the balance
  - `CRITICAL`: difference > 5% of the balance or absolute difference > 10 units
- The supervisor can **approve the adjustment** (balance is updated) or **reject** (divergence stays pending for recount)
- Every approval/rejection is **audited** with user and timestamp

### 2.4 Spreadsheet Import
- New products and initial balance adjustments happen via `.xlsx` or `.csv` file upload
- The system validates required columns before processing: `sku`, `description`, `quantity`, `location`
- Validation errors return a row-by-row list for correction; never import partially without warning
- After a successful import, each row generates an `INBOUND` record in the movement history

### 2.5 Users and Permissions
- **OPERATOR:** can perform counts, view locations, register movements
- **SUPERVISOR:** everything an operator can do + approve/reject divergences, create/edit locations, start count sessions
- **ADMIN:** everything a supervisor can do + manage users, import spreadsheets, access full reports

---

## 3. Tech Stack

### Backend
| Technology | Target version | Use |
|---|---|---|
| Node.js | 20 LTS | Runtime |
| TypeScript | 5.x | Language |
| Express | 4.x | HTTP framework |
| SQLite | via Knex | Database (local file, no server) |
| Zod | 3.x | Schema validation and input validation |
| JWT | `jsonwebtoken` | Stateless authentication |
| bcrypt | `bcryptjs` | Password hashing |
| Multer | latest | File uploads (spreadsheets) |
| xlsx | latest | Excel file reading |

### Frontend
| Technology | Target version | Use |
|---|---|---|
| React | 18.x | UI framework |
| Vite | 5.x | Build tool and dev server |
| TypeScript | 5.x | Language |
| Tailwind CSS | 4.x | Utility-first styling |
| React Router | v6 | SPA routing |
| Recharts | latest | Charts (dashboards) |

### Database
- **SQLite** with Knex as query builder
- Migrations managed via Knex CLI in `backend/src/database/migrations/`
- Custom `BEGIN IMMEDIATE` transactions to eliminate race conditions

### Infrastructure
- Development environment: **Windows 11**, local execution
- No Docker in the initial phase — the goal is to make adoption easy for the store's team
- Future deployment: local server or simple VPS (TBD)

---

## 4. Backend Architecture

```
backend/src/
├── controllers/     # Handle req/res, delegate to services, never contain business logic
├── routes/          # Express route definitions, middleware application
├── services/        # All business logic lives here
├── middlewares/      # Auth, schema validation, error handling
├── utils/           # Pure reusable functions (formatters, helpers)
├── types/           # Global project types and interfaces
└── database/
    ├── migrations/  # Knex migrations
    └── seed.ts       # Seed data for development
```

### Route Pattern
```
/api/v1/{resource}
```
Examples: `/api/v1/products`, `/api/v1/movements`, `/api/v1/inventory`, `/api/v1/dashboard`

### Request Flow
```
Route → Middleware (Auth + Zod Validation) → Controller → Service → DB (Knex) → Response
```

---

## 5. Code Standards

### TypeScript
- `strict: true` in every `tsconfig.json` — no exceptions
- `any` is forbidden — use `unknown` with type guards when needed
- All function parameters and return types must be explicit
- Interfaces for domain objects, `type` for unions and aliases

### Error Handling (Backend)
- All controllers are wrapped with an `asyncHandler` utility to catch async errors
- Business errors use a custom `AppError` class with `statusCode` and `message`
- A global error middleware formats every error response as:
  ```json
  { "success": false, "error": { "code": "DIVERGENCE_EXCEEDS_THRESHOLD", "message": "..." } }
  ```
- Never expose stack traces in production

### API Response Pattern
```json
// Success
{ "success": true, "data": { ... } }

// Error
{ "success": false, "error": { "code": "ERROR_NAME", "message": "Human-readable message" } }
```

### Validation
- **Every** piece of external input (body, params, query) is validated with Zod before reaching the service
- Zod schemas live alongside the relevant controller

### Naming
- Files: `kebab-case` (e.g., `product-service.ts`, `auth-middleware.ts`)
- Classes and Interfaces: `PascalCase`
- Functions and variables: `camelCase`
- Global constants: `UPPER_SNAKE_CASE`
- Database tables: plural `snake_case` (e.g., `products`, `stock_movements`, `inventory_sessions`)
- Database columns: `snake_case` (e.g., `created_at`, `product_id`, `user_id`)

### Frontend
- Components in `PascalCase`, one per file
- Fetch centralized in `src/lib/api.ts`
- Forms with client-side validation

### Commits (Conventional Commits)
```
feat: add divergence threshold with justification
fix: fix race condition in registerCount
docs: update project context
refactor: extract reconciliation logic into service
```

---

## 6. Architecture Decision Records (ADR)

| ID | Decision | Rationale |
|---|---|---|
| ADR-001 | SQLite as the database | No database server required, simplifies deployment on a local environment, single-file data simplifies backup |
| ADR-002 | Knex as query builder (no full ORM) | Maximum visibility into queries, fine-grained control over transactions, avoids ORM "magic" in a system that requires precise data auditing |
| ADR-003 | Simple monorepo (no Turborepo/Nx) | Small team, tooling overhead not justified in the initial phase |
| ADR-004 | No ERP integration in Phase 1 | The store's ERP does not expose an accessible API; spreadsheet integration is the pragmatic path |
| ADR-005 | Counting does not automatically adjust the balance | Protection against operational error; every balance change requires formal session closure, with a divergence threshold and mandatory justification above the limit |
| ADR-006 | Custom `BEGIN IMMEDIATE` transactions | Knex's default SQLite driver emits `BEGIN DEFERRED`, insufficient to eliminate TOCTOU race conditions in concurrent stock operations |
| ADR-007 | Append-only audit trail | `stock_movements` and `inventory_adjustments` are never edited or deleted; reconciliations generate new immutable records in `inventory_session_results` |

---

## 7. Modules and Development Status

| Module | Status |
|---|---|
| Authentication (Login/JWT + RBAC) | Done |
| Product Management (SKUs) | Done |
| Stock Movements | Done |
| Rotating Counts (with blind mode) | Done |
| Divergence Threshold | Done |
| Spreadsheet Import | Done |
| Dashboard / Reports | Done |
| Security Audit (OWASP Top 10) | Done |
| User Management | Not started |

---

## 8. Domain Glossary

| Term | Meaning |
|---|---|
| SKU | Stock Keeping Unit — unique product identifier |
| Location | Physical position in the warehouse |
| Balance | Quantity of a SKU at a location as recorded in the system |
| Count | Physical quantity verified by the operator during inventory |
| Divergence | Difference between expected balance and physical count |
| Count Session | Grouping of counts from a rotating inventory operation |
| Movement | Record of a stock inbound, outbound, or transfer |
| Blind Count | Counting mode where the operator does not see the expected balance, to eliminate bias |

---

*Portfolio project — retail inventory management system*
