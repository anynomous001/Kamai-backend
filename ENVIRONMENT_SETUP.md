# ENVIRONMENT SETUP — Kamai Backend OMS

> Complete setup guide. Updated after every action that changes infrastructure requirements.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 22 LTS | [nodejs.org](https://nodejs.org) or `nvm install 22` |
| pnpm | >= 9.x | `npm install -g pnpm` or `corepack enable` |
| Docker | >= 24.x | [docker.com](https://www.docker.com) |
| Docker Compose | >= 2.x | Bundled with Docker Desktop |
| Git | >= 2.x | System package manager |

Optional but recommended:

| Tool | Purpose |
|------|---------|
| Prisma VS Code Extension | Schema syntax highlighting, auto-complete |
| Bruno / Postman | API testing |

---

## 1. Clone and Install

```bash
git clone <repo-url> kamai-webapp-backend
cd kamai-webapp-backend
pnpm install
```

---

## 2. Environment Variables

Copy the template and fill in your values:

```bash
cp .env.example .env
```

Then open `.env` and fill in **at minimum** these values to start the server:

```env
DATABASE_URL=postgresql://...
JWT_SECRET=<min-32-char-random-string>
JWT_REFRESH_SECRET=<min-32-char-random-string>
COOKIE_SECRET=<min-32-char-random-string>
REDIS_URL=redis://localhost:6379
CORS_ORIGIN=http://localhost:3000
```

> ⚠️ **Never commit `.env` to git.** It is in `.gitignore`.

---

## 3. Start Infrastructure (Docker)

Start Redis locally:

```bash
pnpm run docker:up
```

Or use a managed Redis URL in `.env`.

---

## 4. Database Setup

### 4a. Generate Prisma Client

```bash
pnpm run db:generate
```

### 4b. Run Migrations

```bash
pnpm run db:migrate:dev
```

> First migration will be empty until Action 1 is implemented.

### 4c. (Optional) Open Prisma Studio

```bash
pnpm run db:studio
```

---

## 5. Run the Server

### Development (hot reload)

```bash
pnpm run dev
```

Server starts at: http://localhost:3001

Swagger docs: http://localhost:3001/docs

Health check: http://localhost:3001/health

### Production Build

```bash
pnpm run build
pnpm run start
```

---

## 6. Testing

### Run All Tests

```bash
pnpm run test
```

### Run Tests with Coverage

```bash
pnpm run test:coverage
```

### Run Tests in Watch Mode

```bash
pnpm run test:watch
```

---

## 7. Linting & Formatting

```bash
# Lint
pnpm run lint

# Fix lint issues
pnpm run lint:fix

# Format
pnpm run format

# Check format (CI)
pnpm run format:check

# Type check
pnpm run type-check
```

---

## 8. Docker

### Build and Run Everything

```bash
pnpm run docker:build
pnpm run docker:up
pnpm run docker:logs
```

### Stop

```bash
pnpm run docker:down
```

---

## 9. Migration Commands Reference

| Command | Purpose |
|---------|---------|
| `pnpm run db:generate` | Regenerate Prisma client after schema change |
| `pnpm run db:migrate:dev` | Create and apply new migration (dev) |
| `pnpm run db:migrate:deploy` | Apply pending migrations (production) |
| `pnpm run db:migrate:reset` | ⚠️ Drop and recreate database (dev only) |
| `pnpm run db:studio` | Open Prisma Studio browser UI |
| `pnpm run db:seed` | Run seed script |

---

## 10. Project Structure

```
kamai-webapp-backend/
├── src/
│   ├── main.ts              # Entry point
│   ├── app.ts               # Fastify app factory
│   ├── config/
│   │   └── env.ts           # Zod-validated env config
│   ├── modules/             # Feature modules (per action)
│   │   ├── auth/
│   │   ├── baker/
│   │   ├── orders/
│   │   ├── customers/
│   │   ├── dashboard/
│   │   ├── billing/
│   │   ├── payments/
│   │   ├── notifications/
│   │   ├── calendar/
│   │   ├── investments/
│   │   ├── support/
│   │   └── uploads/
│   ├── shared/
│   │   ├── database/        # Prisma singleton
│   │   ├── errors/          # Typed error classes
│   │   ├── logger/          # Pino logger
│   │   ├── types/           # Shared TS types
│   │   └── utils/           # Shared utilities
│   ├── plugins/             # Fastify plugins
│   ├── middlewares/         # Auth and other middlewares
│   ├── types/               # Global type augmentations
│   └── tests/               # Test setup and helpers
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── .github/workflows/       # CI/CD
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── PROJECT_STATE.md
├── CHANGELOG.md
├── ARCHITECTURE_DECISIONS.md
├── TODO.md
├── KNOWN_ISSUES.md
└── ENVIRONMENT_SETUP.md
```

---

## Environment Variables Reference

See [.env.example](.env.example) for the full list with descriptions.
