# Database

SQLite through the Prisma ORM, using the `better-sqlite3` adapter. The entire database is the file
`server/dev.db`, which is kept out of git.

Schema: [prisma/schema.prisma](../server/prisma/schema.prisma) ·
connection: [src/db.ts](../server/src/db.ts) ·
configuration: [prisma.config.ts](../server/prisma.config.ts)

## Models

![Entity relationship diagram: User has many RefreshTokens and many Todos, both linked by userId](images/data-model.png)

Both `RefreshToken` and `Todo` hang off `User` through `userId` — the column that makes every task
and every session belong to exactly one person.

### User

| field | type | note |
|---|---|---|
| `id` | uuid | primary key |
| `email` | text, unique | stored lowercased |
| `passwordHash` | text | argon2 hash — **never** the password |
| `createdAt` | datetime | |

### RefreshToken

| field | type | note |
|---|---|---|
| `id` | uuid | |
| `tokenHash` | text, unique | SHA-256 of the token; the raw token is never stored |
| `userId` | uuid | owner, indexed |
| `expiresAt` | datetime | 30 days after creation |
| `revokedAt` | datetime or null | set on logout or on rotation |
| `createdAt` | datetime | |

One row per active session. Since every refresh inserts a new row and revokes the previous one,
the rotation history stays visible in the table — handy while learning the flow.

### Todo

| field | type | note |
|---|---|---|
| `id` | uuid | |
| `title` | text | 1 to 200 characters, validated in the route |
| `done` | boolean | defaults to `false` |
| `userId` | uuid | **this is what makes each task belong to one user**, indexed |
| `createdAt` | datetime | used to sort the list |

Both relations use `onDelete: Cascade`: deleting a user deletes their tasks and tokens.

## Commands

All of them inside `server/`:

```bash
npx prisma migrate dev --name description   # create and apply a migration after a schema change
npm run db:migrate                          # shortcut for the command above
npx prisma migrate deploy                   # apply existing migrations (another machine, production)
npx prisma generate                         # regenerate the Prisma Client into src/generated
npm run db:studio                           # open the visual database browser
```

## Migrations

They live in [prisma/migrations/](../server/prisma/migrations/) and **are versioned in git**. That
is how someone else recreates the database from scratch with one command, without ever receiving
your `dev.db`.

The flow after editing [schema.prisma](../server/prisma/schema.prisma) is always: change the
schema, run `npm run db:migrate`, then commit the migration folder together with the schema
change.

## The generated Prisma Client

The schema outputs it to `server/src/generated/`, which is in `.gitignore`: it is generated code,
recreated by `npx prisma generate` (which `migrate` already runs for you). Whoever clones the repo
generates their own on the first migration.

## Prisma Studio

The [scripts/studio.mjs](../server/scripts/studio.mjs) script exists for a specific reason: Prisma
Studio 7 only accepts URLs in `protocol://` form, and the `file:./dev.db` from `.env` makes it fail
with *"Prisma Studio is not supported for the file protocol"*. The script builds the URL with the
absolute path of the database and passes it along.

```bash
npm run db:studio     # works
npx prisma studio     # fails with the protocol error
```

## Switching to Postgres

No query uses SQLite-specific SQL, so the switch is small:

1. Set `provider = "postgresql"` in [schema.prisma](../server/prisma/schema.prisma).
2. Install the `@prisma/adapter-pg` adapter and adjust [db.ts](../server/src/db.ts).
3. Point `DATABASE_URL` at the Postgres server.
4. Delete the migrations folder and run `npx prisma migrate dev --name init` again, since the
   existing migrations contain SQLite SQL.
