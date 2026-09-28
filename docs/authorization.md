# Authorization

Authentication answers *who you are*; authorization answers *what is yours*. This document covers
the second one, implemented in [routes/todos.ts](../server/src/routes/todos.ts).

## The rule

> The `userId` always comes from the token. Never from the body, the query string or the URL.

The token is signed by the server, so the client cannot alter it. Anything the client sends, by
contrast, is a request — not a fact.

```ts
// ❌ the client picks whose data it gets
where: { userId: request.body.userId }

// ✅ the server already knows whose data it is
where: { userId: request.user.id }
```

`request.user` is filled in by [authenticate](../server/src/plugins/authenticate.ts), which runs
before every task route:

```ts
app.addHook('preHandler', authenticate);
```

Because the hook is registered inside the tasks plugin, it applies only to the routes in that
file. The routes in [auth.ts](../server/src/routes/auth.ts) live in another scope and stay public.

## Reading: the filter belongs in the query

```ts
prisma.todo.findMany({
  where: { userId: request.user.id },
  orderBy: { createdAt: 'desc' },
  select: todoFields,
});
```

There is no "fetch everything and filter later". The database returns only what belongs to the
user, which avoids the classic leak of sending the full list to the client and merely hiding it in
the interface.

The `select` matters too: the response carries `id`, `title` and `done`, and `userId` never leaves
the server.

## Writing and deleting: a composite filter

Updating and deleting are where this usually goes wrong:

```ts
const { count } = await prisma.todo.updateMany({
  where: { id, userId: request.user.id },
  data: { done },
});

if (count === 0) {
  return reply.code(404).send({ error: 'Task not found' });
}
```

**Why `updateMany` and not `update`.** Prisma's `update` only filters by a unique field — the `id`
— which would let any authenticated user modify anyone else's task. `updateMany` accepts the
composite filter, resolves it in a single query, and returns `count`, the number of affected rows.
Fetching first and updating after would work, but that is two queries and a race window between
them.

**Why 404 and not 403.** `count === 0` covers two cases: the task does not exist, or it belongs to
someone else. Answering 403 ("it exists, but it isn't yours") would confirm that the id exists.
The response is identical in both cases.

This flaw has a name: **IDOR** (*Insecure Direct Object Reference*), one of the most common bugs
in real-world APIs.

## The same task, two owners

Two identical requests — same route, same id — differing only by token:

| caller | query that runs | rows | response |
|---|---|---|---|
| owner | `where: { id: 'abc123', userId: 'A' }` | 1 | `204` |
| another user | `where: { id: 'abc123', userId: 'B' }` | 0 | `404` |

## Extra fields in the body are ignored

If someone sends `POST /todos` with `{ "title": "x", "userId": "someone-else" }`, the `userId` is
simply dropped: the zod schema only extracts `title`.

```ts
const createTodoSchema = z.object({ title: z.string().trim().min(1).max(200) });
const { title } = createTodoSchema.parse(request.body);

await prisma.todo.create({ data: { title, userId: request.user.id } });
```

Validating against a closed schema, instead of handing `request.body` straight to the database, is
what prevents *mass assignment*: the client can only write to the fields the schema declares.

## How to verify it

The manual test script, with ready-to-run commands, is in
[development.md](development.md#authorization-test).
