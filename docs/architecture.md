# Architecture

The project has two independent halves that talk only over HTTP:

```
list-to-do/
├── server/     REST API — Node + Fastify + Prisma + SQLite
├── mobile/     App — Expo + Expo Router + React Native
└── docs/       this documentation
```

There is no shared code between them. Their only contract is the JSON described in
[api.md](api.md).

## The server

```
server/
├── prisma/
│   ├── schema.prisma              User, RefreshToken and Todo models
│   └── migrations/                database history, versioned in git
├── scripts/
│   └── studio.mjs                 opens Prisma Studio pointed at dev.db
└── src/
    ├── server.ts                  starts the server on its port and host
    ├── app.ts                     builds Fastify: CORS, routes, error handling
    ├── env.ts                     validates environment variables at startup
    ├── db.ts                      instantiates the Prisma Client
    ├── lib/tokens.ts              signs, verifies and generates tokens
    ├── plugins/authenticate.ts    validates the Bearer token, fills request.user
    └── routes/
        ├── auth.ts                register, login, refresh and logout
        └── todos.ts               task CRUD
```

Files: [server.ts](../server/src/server.ts) · [app.ts](../server/src/app.ts) ·
[env.ts](../server/src/env.ts) · [db.ts](../server/src/db.ts) ·
[lib/tokens.ts](../server/src/lib/tokens.ts) ·
[plugins/authenticate.ts](../server/src/plugins/authenticate.ts) ·
[routes/auth.ts](../server/src/routes/auth.ts) · [routes/todos.ts](../server/src/routes/todos.ts)

### The path of a request

```
request
   ↓
app.ts          CORS, JSON parsing
   ↓
authenticate    only on the todos.ts routes — validates the token, fills request.user
   ↓
route           validates the body with zod, queries Prisma filtering by request.user.id
   ↓
setErrorHandler zod error → 400 · Fastify error → its own status · anything else → generic 500
   ↓
response
```

The `preHandler` registered in [todos.ts](../server/src/routes/todos.ts) applies only to the
routes in that file. Every `app.register()` in Fastify creates an isolated scope, which is why the
`/auth` routes stay public with no extra configuration.

## The app

```
mobile/src/
├── app/                      every file is a route (Expo Router)
│   ├── _layout.tsx           picks between public and protected screens
│   ├── sign-in.tsx           login
│   ├── sign-up.tsx           registration
│   └── (app)/
│       ├── _layout.tsx       group of protected screens
│       └── index.tsx         task list
├── auth/AuthContext.tsx      session state, exposed through the useAuth hook
├── services/
│   ├── api.ts                fetch, SecureStore and automatic refresh
│   └── todos.ts              the four CRUD calls
└── components/               AuthForm, Button, TextField and the colors
```

Files: [_layout.tsx](../mobile/src/app/_layout.tsx) ·
[sign-in.tsx](../mobile/src/app/sign-in.tsx) · [sign-up.tsx](../mobile/src/app/sign-up.tsx) ·
[(app)/index.tsx](../mobile/src/app/%28app%29/index.tsx) ·
[AuthContext.tsx](../mobile/src/auth/AuthContext.tsx) ·
[services/api.ts](../mobile/src/services/api.ts) ·
[services/todos.ts](../mobile/src/services/todos.ts)

The layers are kept apart: screens never call `fetch`, and `api.ts` never knows what a task is.
Details in [mobile-app.md](mobile-app.md).

## Decisions and why

**SQLite instead of Postgres.** This is a learning project: no database server to install, and the
whole database is a single file. Switching to Postgres is one line in the
[schema.prisma](../server/prisma/schema.prisma) plus the matching adapter, because no query uses
SQLite-specific SQL.

**HS256 instead of RS256.** HS256 uses a symmetric secret: the same key signs and verifies. That
works here because a single service both issues and validates the tokens. RS256 would make sense
if other services needed to validate tokens without being able to create them.

**A short, stateless access token.** 15 minutes, verified by its signature alone, with no database
round trip. The price is that it cannot be revoked — and that is exactly what the refresh token,
stored in the database, solves. The full reasoning is in [authentication.md](authentication.md).

**An opaque refresh token, not a JWT.** It carries no information: it is just a 32-byte random key
used to look up a row. Since the database stores only its SHA-256 hash, a database leak hands over
no usable session.

**404 instead of 403 on another user's task.** A 403 would confirm that the id exists. See
[authorization.md](authorization.md).

**Validation with zod inside the route.** Fastify supports native JSON schemas, but zod gives the
TypeScript types for free and keeps the error messages in one place. The `setErrorHandler` in
[app.ts](../server/src/app.ts) turns any `ZodError` into a 400.

## Known limits

Things a production app would have and this one does not, all deliberate so the project stays
focused on authentication:

- **No rate limiting** on login. In production, `@fastify/rate-limit` on that route is mandatory.
- **No email confirmation** and no password recovery.
- **No HTTPS** locally. In production, tokens travel over TLS only.
- **No cleanup of expired refresh tokens.** The table grows forever; a periodic job would delete
  rows whose `expiresAt` is in the past.
- **No automated tests** in the repository. The manually tested scenarios are listed in
  [development.md](development.md).
