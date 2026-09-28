# V2.3 Developer Environment

## 1. Copy environment

```bash
cp .env.example .env
```

Generate a strong `AUTH_SECRET` before real use and add an OpenAI API key for real AI execution.

## 2. Start infrastructure

```bash
docker compose up -d postgres
```

## 3. Install

```bash
npm ci
```

## 4. Prisma

```bash
npx prisma generate
npx prisma migrate dev
npm run db:seed --if-present
```

## 5. Run

```bash
npm run dev
```

## 6. Quality

```bash
npm run typecheck --if-present
npm test --if-present
npm run build
```

## Runtime dependencies
- PostgreSQL 16
- pgvector
- Node.js 20+
- npm
- OpenAI API key for real AI mode
