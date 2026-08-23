# TaskFlow - Multi-Tenant Project Management Backend

Live API:https://taskflow-production-e248.up.railway.app
Health check:https://taskflow-production-e248.up.railway.app/health
API Docs (Swagger):https://taskflow-production-e248.up.railway.app/api-docs/

TaskFlow is a backend system for managing organizations, projects, tasks, and
assignments, with asynchronous email notifications on task assignment. Built
with strict multi-tenant data isolation, clean layered architecture, and
production-oriented reliability (retries, dead-letter queues, rate limiting).

Full system design: [ARCHITECTURE.md](./ARCHITECTURE.md)

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js / Express (TypeScript) |
| Database | PostgreSQL |
| ORM | Prisma |
| Job Queue | Redis + BullMQ |
| Auth | JWT (access + refresh) + bcrypt |
| Validation | Zod |
| Testing | Vitest |
| API Docs | OpenAPI / Swagger UI |
| Containers | Docker Compose |

## Prerequisites

- Docker and Docker Compose
- Node.js 18+ (optional, only needed if running outside Docker)

## Setup Instructions

### 1. Clone


git clone https://github.com/abhaydv-prog/taskflow.git
cd taskflow


### 2. Environment variables


cp .env.example .env


| Variable | Description | Example |
|----------|-------------|---------|
| DATABASE_URL | PostgreSQL connection string | postgresql://user:pass@postgres:5432/taskflow |
| REDIS_URL | Redis connection string | redis://redis:6379 |
| JWT_ACCESS_SECRET | Secret for signing access tokens | random 32+ char string |
| JWT_REFRESH_SECRET | Secret for signing refresh tokens | random 32+ char string |
| JWT_ACCESS_TTL | Access token lifetime | 15m |
| JWT_REFRESH_TTL | Refresh token lifetime | 7d |
| PORT | API server port | 3000 |
| NODE_ENV | Environment | development |

Never commit `.env` - only `.env.example` (placeholders) is tracked. For
tests, copy `.env.test.example` to `.env.test`.

### 3. Run with Docker Compose


docker compose up --build


Starts 4 services: api, worker, postgres, redis.

### 4. Migrate and seed the database


docker compose exec api npx prisma migrate deploy
docker compose exec api npx prisma db seed


Seeds: 2 organizations, 5 users, multiple projects, 10+ tasks across
statuses/priorities, assignments, and comments.

### 5. Verify it's running


curl http://localhost:3000/health


## API Documentation

- Swagger UI: http://localhost:3000/docs
- OpenAPI spec: [src/docs/openapi.json](./src/docs/openapi.json)
- Postman collection: [postman/TaskFlow.postman_collection.json](./postman/TaskFlow.postman_collection.json) - imports and runs with no manual edits against http://localhost:3000

### Endpoint Reference

#### Auth

**POST /auth/register**

Request:

{ "email": "jane@acme.com", "password": "SecurePass123!", "name": "Jane Doe", "orgName": "Acme Inc" }


Response (201):

{ "user": { "id": "uuid", "email": "jane@acme.com", "name": "Jane Doe" },
  "organization": { "id": "uuid", "name": "Acme Inc" } }


**POST /auth/login**

Request:

{ "email": "jane@acme.com", "password": "SecurePass123!" }


Response (200):

{ "accessToken": "eyJ...", "refreshToken": "a1b2...", "expiresIn": 900 }


**POST /auth/refresh**

Request:

{ "refreshToken": "a1b2..." }


Response (200):

{ "accessToken": "eyJ...", "refreshToken": "c3d4...", "expiresIn": 900 }


**POST /auth/logout**

Request (Authorization: Bearer accessToken):

{ "refreshToken": "a1b2..." }


Response (200):

{ "message": "Logged out successfully" }


All /auth/* routes are rate-limited to 10 requests/minute/IP.

#### Projects

**GET /projects** - list projects in caller's org (paginated)

Response (200):

{ "data": [ { "id": "uuid", "name": "Website Redesign", "status": "active" } ],
  "total": 4, "page": 1, "limit": 20 }


**POST /projects**

Request:

{ "name": "Website Redesign", "description": "Q3 marketing site refresh" }


Response (201):

{ "id": "uuid", "name": "Website Redesign", "organizationId": "uuid", "createdAt": "..." }


**GET /projects/:id/dashboard** - task counts grouped by status

Response (200):

{ "projectId": "uuid",
  "counts": { "todo": 3, "in_progress": 2, "review": 1, "done": 5 } }


**PUT /projects/:id**, **DELETE /projects/:id** - admin only for delete.

#### Tasks

**GET /tasks?status=todo&priority=high&assignee=userId&dueFrom=2026-01-01&dueTo=2026-02-01&page=1&limit=20**

Response (200):

{ "data": [ { "id": "uuid", "title": "Fix login bug", "status": "todo", "priority": "high" } ],
  "total": 12, "page": 1, "limit": 20 }


**POST /tasks**

Request:

{ "projectId": "uuid", "title": "Fix login bug", "description": "...", "priority": "high" }


Response (201):

{ "id": "uuid", "title": "Fix login bug", "status": "todo", "priority": "high", "projectId": "uuid" }


**POST /tasks/:id/assign**

Request:

{ "userId": "uuid" }


Response (200):

{ "assignment": { "taskId": "uuid", "userId": "uuid", "assignedAt": "..." },
  "jobId": "bullmq-job-id" }


**DELETE /tasks/:id/assign/:userId** - unassign a user.

#### Jobs

**GET /jobs/:id**

Response (200):

{ "id": "bullmq-job-id", "status": "completed",
  "attemptsMade": 1, "data": { "taskId": "uuid", "userId": "uuid" } }


Status values: pending, active, completed, failed.

#### Error Format (all endpoints)


{ "error": "Task not found", "code": "TASK_NOT_FOUND", "details": {} }


Cross-tenant access attempts return:

{ "error": "Forbidden", "code": "FORBIDDEN", "details": {} }

with HTTP 403, and never reveal whether the resource exists in another org.

## Running Tests


npm install
npm run test
npm run test:unit
npm run test:integration


Integration tests run against a dedicated test database, isolated per test
(see tests/setup/testDb.ts).

## Project Structure
```
src/
  app.ts
  routes/
  controllers/
  services/
  middleware/
  docs/
  jobs/
prisma/
  schema.prisma
  migrations/
  seed.ts
tests/
  unit/
  integration/
  setup/
postman/
  TaskFlow.postman_collection.json
```

## Security

- Passwords hashed with bcrypt, cost factor 12 or higher
- Access tokens: JWT, 15-minute TTL. Refresh tokens: 7-day TTL, stored hashed in DB with revocation support
- All tenant-scoped queries filter by org_id taken from the verified JWT. Client-supplied org_id is never trusted
- /auth/* rate-limited to 10 requests/minute/IP
- No secrets committed. .env and .env.test are gitignored; only .env.example and .env.test.example (placeholders) are tracked

## Submission

| Item | Link |
|------|------|
| GitHub Repository | https://github.com/abhaydv-prog/taskflow |
| Architecture Document | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| API Documentation | Swagger UI (/docs), openapi.json, Postman collection |
| Demo / Screen Recording | add video link here |
| Setup Instructions | see Setup Instructions section above |
