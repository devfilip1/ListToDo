# API reference

Base URL: `http://localhost:3333` (set by `PORT` in the server's `.env`).
Every response is JSON, except `204` responses, which have no body.

| route | token required | file |
|---|---|---|
| `GET /health` | no | [app.ts](../server/src/app.ts) |
| `POST /auth/register` | no | [routes/auth.ts](../server/src/routes/auth.ts) |
| `POST /auth/login` | no | [routes/auth.ts](../server/src/routes/auth.ts) |
| `POST /auth/refresh` | no (uses the refresh token in the body) | [routes/auth.ts](../server/src/routes/auth.ts) |
| `POST /auth/logout` | no (uses the refresh token in the body) | [routes/auth.ts](../server/src/routes/auth.ts) |
| `GET /todos` | yes | [routes/todos.ts](../server/src/routes/todos.ts) |
| `POST /todos` | yes | [routes/todos.ts](../server/src/routes/todos.ts) |
| `PATCH /todos/:id` | yes | [routes/todos.ts](../server/src/routes/todos.ts) |
| `DELETE /todos/:id` | yes | [routes/todos.ts](../server/src/routes/todos.ts) |

On protected routes the token goes in the header:

```
Authorization: Bearer <accessToken>
```

## Authentication

### `POST /auth/register`

```json
{ "email": "a@test.com", "password": "secret123" }
```

The email is normalized before validation (trimmed and lowercased); the password needs at least 6
characters.

**201** — returns a ready-to-use session:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
  "refreshToken": "N3hLp2...",
  "user": { "id": "3f1c...", "email": "a@test.com" }
}
```

| error | when |
|---|---|
| `400` | invalid email or short password — the reason comes in the `error` field |
| `409` | `{ "error": "This email is already registered" }` |

### `POST /auth/login`

Same body as registration. **200** with the same response shape.

**401** — `{ "error": "Invalid email or password" }`, both for a wrong password and for an email
that does not exist. The reasoning is in
[authentication.md](authentication.md#registration-and-login).

### `POST /auth/refresh`

```json
{ "refreshToken": "N3hLp2..." }
```

**200** — a brand new pair, in the same shape as login. The refresh token you sent is revoked in
the process: each one is valid **exactly once**.

**401** — `{ "error": "Session expired" }` when the token does not exist, has expired, has already
been used, or was revoked by a logout. A reused token also revokes every other session for that
user.

### `POST /auth/logout`

```json
{ "refreshToken": "N3hLp2..." }
```

**204** — always, even for a token that does not exist. The access token stays valid until it
expires, at most 15 minutes later.

## Tasks

All of these require `Authorization: Bearer <accessToken>` and answer **401**
(`{ "error": "Not authenticated" }`) when the token is missing, malformed, tampered with or
expired.

### `GET /todos`

**200** — only the tasks belonging to the token's user, newest first:

```json
[
  { "id": "9b2e...", "title": "Study JWT", "done": false },
  { "id": "1a7d...", "title": "Publish on GitHub", "done": true }
]
```

### `POST /todos`

```json
{ "title": "Study JWT" }
```

The title is trimmed and must be 1 to 200 characters. Extra fields, including a `userId`, are
ignored — the owner always comes from the token.

**201** — the created task. **400** — empty or too long title.

### `PATCH /todos/:id`

```json
{ "done": true }
```

**204** — updated. **400** — `done` missing or not a boolean.
**404** — `{ "error": "Task not found" }`.

### `DELETE /todos/:id`

**204** — deleted. **404** — `{ "error": "Task not found" }`.

> **About that 404:** it deliberately covers both "does not exist" and "belongs to another user".
> See [authorization.md](authorization.md).

## Diagnostics

### `GET /health`

**200** — `{ "status": "ok" }`. It runs a `SELECT 1` against the database, so a successful
response confirms that both the API **and** the database are up.

## Status codes used

| code | meaning in this project |
|---|---|
| `200` | success, with a body |
| `201` | created (registration and new task) |
| `204` | success, no body (logout, update, delete) |
| `400` | invalid body — a zod error, with the reason in `error` |
| `401` | not authenticated, or invalid credentials/session |
| `404` | task missing **or** owned by another user |
| `409` | email already registered |
| `500` | unexpected failure — generic response, details only in the server log |

The central handling lives in the `setErrorHandler` of [app.ts](../server/src/app.ts).
