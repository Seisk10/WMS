# WMS — Memória de Contexto do Projeto

> **Instrução para a IA:** Leia este arquivo inteiro antes de qualquer resposta. Ele contém o contexto de negócio, regras críticas, stack e padrões de código que definem este projeto. Nunca assuma nada que contrarie o que está aqui.

---

## 1. Contexto do Negócio

### Cenário de Aplicação
- **Setor:** varejo de materiais de construção e decoração
- **Sistema:** WMS — sistema de apoio logístico **complementar** (não substitui o ERP principal)

### O Depósito
- Depósito de **porte pequeno/médio**, com alto giro de mercadoria
- Estoque predominantemente **aéreo e dinâmico**: produtos armazenados em prateleiras altas, posições flutuantes (endereçamento não-fixo por natureza)
- Operação realizada por equipe enxuta; processos manuais são comuns hoje
- **Sem integração direta com o ERP** na fase atual — toda entrada de dados ocorre via **importação de planilhas Excel/CSV** ou digitação manual

### Objetivo do Sistema
Digitalizar e dar visibilidade ao processo de gestão de estoque, com foco em:
1. **Endereçamento** de produtos (onde cada SKU está fisicamente)
2. **Contagens Rotativas** (substituir papéis e planilhas de inventário parcial)
3. **Alertas de Divergência** (diferença entre saldo no sistema vs. contagem física)
4. **Rastreabilidade** de movimentações (entradas, saídas, transferências entre endereços)

---

## 2. Regras de Negócio Críticas

### 2.1 Endereçamento Flexível e Múltiplo
- Um produto (SKU) **pode estar em múltiplos endereços simultaneamente** (ex: Rua A / Prateleira 3 E Rua C / Prateleira 1)
- Um endereço **pode conter múltiplos SKUs**
- Endereços seguem o padrão: `RUA-MÓDULO-NÍVEL-POSIÇÃO` (ex: `A-01-3-P2`)
- O sistema deve permitir **criar, editar e inativar endereços** sem perda de histórico
- Movimentações entre endereços geram **registro de transferência** com timestamp e usuário responsável

### 2.2 Contagens Rotativas
- Substituem completamente o papel: o operador usa a interface web (mobile-friendly) para registrar contagens
- Uma **sessão de contagem** tem estado: `ABERTA → EM_ANDAMENTO → AGUARDANDO_REVISÃO → ENCERRADA`
- Cada item contado gera um registro com: SKU, endereço, quantidade contada, usuário, timestamp
- É possível contar o mesmo endereço/SKU mais de uma vez na mesma sessão (recontagem), gerando um histórico
- A contagem **não altera o saldo** automaticamente — ela gera um **apontamento de divergência** para aprovação do supervisor

### 2.3 Alertas de Divergência
- Divergência = diferença entre `saldo_sistema` e `quantidade_contada`
- Toda divergência é classificada por severidade:
  - `OK`: diferença = 0
  - `ATENÇÃO`: diferença entre 1% e 5% do saldo
  - `CRÍTICO`: diferença > 5% do saldo ou diferença absoluta > 10 unidades
- O supervisor pode **aprovar o ajuste** (saldo é atualizado) ou **rejeitar** (divergência fica pendente para recontagem)
- Toda aprovação/rejeição é **auditada** com usuário e timestamp

### 2.4 Importação via Planilha
- Entrada de novos produtos e ajustes de saldo inicial ocorrem via upload de arquivo `.xlsx` ou `.csv`
- O sistema valida as colunas obrigatórias antes de processar: `sku`, `descricao`, `quantidade`, `endereco`
- Erros de validação retornam uma lista linha-a-linha para correção; nunca importar parcialmente sem aviso
- Após importação bem-sucedida, cada linha gera um registro de `ENTRADA` no histórico de movimentação

### 2.5 Usuários e Permissões
- **OPERADOR:** pode realizar contagens, consultar endereços, registrar movimentações
- **SUPERVISOR:** tudo do operador + aprovar/rejeitar divergências, criar/editar endereços, iniciar sessões de contagem
- **ADMIN:** tudo do supervisor + gerenciar usuários, importar planilhas, acessar relatórios completos

---

## 3. Stack Tecnológica

### Backend
| Tecnologia | Versão alvo | Uso |
|---|---|---|
| Node.js | 20 LTS | Runtime |
| TypeScript | 5.x | Linguagem |
| Express | 4.x | Framework HTTP |
| SQLite | via Knex | Banco de dados (arquivo local, sem servidor) |
| Zod | 3.x | Validação de schemas e entrada de dados |
| JWT | `jsonwebtoken` | Autenticação stateless |
| bcrypt | `bcryptjs` | Hash de senhas |
| Multer | latest | Upload de arquivos (planilhas) |
| xlsx | latest | Leitura de arquivos Excel |

### Frontend
| Tecnologia | Versão alvo | Uso |
|---|---|---|
| React | 18.x | UI Framework |
| Vite | 5.x | Build tool e dev server |
| TypeScript | 5.x | Linguagem |
| Tailwind CSS | 4.x | Estilização utility-first |
| React Router | v6 | Roteamento SPA |
| Recharts | latest | Gráficos (dashboards) |

### Banco de Dados
- **SQLite** com Knex como query builder
- Migrations gerenciadas via Knex CLI em `backend/src/database/migrations/`
- Transações `BEGIN IMMEDIATE` customizadas para eliminar race conditions

### Infraestrutura
- Ambiente de desenvolvimento: **Windows 11**, execução local
- Sem Docker na fase inicial — o objetivo é facilitar a adoção pelo time da loja
- Deploy futuro: servidor local ou VPS simples (a definir)

---

## 4. Arquitetura do Backend

```
backend/src/
├── controllers/     # Recebem req/res, delegam para services, nunca contêm lógica de negócio
├── routes/          # Definição de rotas Express, aplicação de middlewares
├── services/        # Toda a lógica de negócio está aqui
├── middlewares/     # Auth, validação de schema, tratamento de erros
├── utils/           # Funções puras reutilizáveis (formatadores, helpers)
├── types/           # Interfaces e tipos globais do projeto
└── database/
    ├── migrations/  # Migrations Knex
    └── seed.ts       # Dados iniciais para desenvolvimento
```

### Padrão de Rota
```
/api/v1/{recurso}
```
Exemplos: `/api/v1/products`, `/api/v1/movements`, `/api/v1/inventory`, `/api/v1/dashboard`

### Fluxo de Request
```
Route → Middleware (Auth + Zod Validation) → Controller → Service → DB (Knex) → Response
```

---

## 5. Padrões de Código

### TypeScript
- `strict: true` em todos os `tsconfig.json` — sem exceções
- Proibido usar `any` — usar `unknown` com type guards quando necessário
- Todos os parâmetros de função e retornos devem ter tipos explícitos
- Interfaces para objetos de domínio, `type` para unions e aliases

### Tratamento de Erros (Backend)
- Todos os controllers são wrappados com um `asyncHandler` utilitário para capturar erros assíncronos
- Erros de negócio usam uma classe `AppError` customizada com `statusCode` e `message`
- Um middleware global de erro formata todas as respostas de erro no padrão:
  ```json
  { "success": false, "error": { "code": "DIVERGENCE_EXCEEDS_THRESHOLD", "message": "..." } }
  ```
- Nunca expor stack traces em produção

### Padrão de Resposta da API
```json
// Sucesso
{ "success": true, "data": { ... } }

// Erro
{ "success": false, "error": { "code": "NOME_DO_ERRO", "message": "Mensagem legível" } }
```

### Validação
- **Toda** entrada de dados externos (body, params, query) é validada com Zod antes de chegar ao service
- Schemas Zod ficam junto ao controller relevante

### Nomenclatura
- Arquivos: `kebab-case` (ex: `product-service.ts`, `auth-middleware.ts`)
- Classes e Interfaces: `PascalCase`
- Funções e variáveis: `camelCase`
- Constantes globais: `UPPER_SNAKE_CASE`
- Tabelas do banco: `snake_case` plural (ex: `products`, `stock_movements`, `inventory_sessions`)
- Colunas do banco: `snake_case` (ex: `created_at`, `product_id`, `user_id`)

### Frontend
- Componentes em `PascalCase`, um por arquivo
- Fetch centralizado em `src/lib/api.ts`
- Formulários com validação client-side

### Commits (Conventional Commits)
```
feat: adiciona threshold de divergência com justificativa
fix: corrige race condition em registerCount
docs: atualiza contexto do projeto
refactor: extrai lógica de reconciliação para service
```

---

## 6. Decisões de Arquitetura Registradas (ADR)

| ID | Decisão | Motivo |
|---|---|---|
| ADR-001 | SQLite como banco de dados | Sem necessidade de servidor de banco, facilita deploy em ambiente local, dados em arquivo único facilita backup |
| ADR-002 | Knex como query builder (sem ORM completo) | Máxima visibilidade sobre as queries, controle fino sobre transações, evita magia de ORM em um sistema que requer auditoria precisa de dados |
| ADR-003 | Monorepo simples (sem Turborepo/Nx) | Equipe pequena, overhead de tooling não justificado na fase inicial |
| ADR-004 | Sem integração ERP na Fase 1 | ERP da loja não expõe API acessível; integração via planilha é o caminho pragmático |
| ADR-005 | Contagem não altera saldo automaticamente | Proteção contra erro operacional; toda alteração de saldo exige fechamento formal de sessão, com threshold de divergência e justificativa obrigatória acima do limite |
| ADR-006 | Transações `BEGIN IMMEDIATE` customizadas | O driver SQLite padrão do Knex emite `BEGIN DEFERRED`, insuficiente para eliminar race conditions TOCTOU em operações concorrentes de estoque |
| ADR-007 | Audit trail append-only | `stock_movements` e `inventory_adjustments` nunca são editados ou deletados; reconciliações geram novos registros imutáveis em `inventory_session_results` |

---

## 7. Módulos e Status de Desenvolvimento

| Módulo | Status |
|---|---|
| Autenticação (Login/JWT + RBAC) | Concluído |
| Gestão de Produtos (SKUs) | Concluído |
| Movimentações de Estoque | Concluído |
| Contagens Rotativas (com modo cego) | Concluído |
| Threshold de Divergência | Concluído |
| Importação via Planilha | Concluído |
| Dashboard / Relatórios | Concluído |
| Auditoria de Segurança (OWASP Top 10) | Concluído |
| Gestão de Usuários | Não iniciado |

---

## 8. Glossário do Domínio

| Termo | Significado |
|---|---|
| SKU | Stock Keeping Unit — código único de identificação de produto |
| Endereço | Localização física no depósito |
| Saldo | Quantidade de um SKU em um endereço registrada no sistema |
| Contagem | Quantidade física verificada pelo operador durante inventário |
| Divergência | Diferença entre saldo esperado e contagem física |
| Sessão de Contagem | Agrupamento de contagens de uma operação de inventário rotativo |
| Movimento | Registro de entrada, saída ou transferência de estoque |
| Contagem Cega | Modo de contagem em que o operador não vê o saldo esperado, para eliminar viés |

---

*Projeto de portfólio — sistema de gestão de estoque para varejo*
