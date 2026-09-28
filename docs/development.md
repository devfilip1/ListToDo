# Development

## Requirements

- Node 22 or newer (built on 24)
- The [Expo Go](https://expo.dev/go) app on your phone, or an emulator
- Phone and computer on the **same Wi-Fi network**

## Installation

```bash
git clone https://github.com/devfilip1/ListToDo.git
cd ListToDo

# API
cd server
npm install
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # paste into JWT_SECRET
npx prisma migrate dev        # creates dev.db and generates the Prisma Client

# App
cd ../mobile
npm install
cp .env.example .env          # set EXPO_PUBLIC_API_URL to your computer's IP
```

If the app's `npm install` fails with `ERESOLVE`, use `npm install --legacy-peer-deps`. It is an
optional peer dependency conflict between Expo Router's internal packages
(`react-native-worklets`) and does not affect the project.

## Environment variables

`server/.env` — **never committed**, the only place with a secret:

| variable | purpose |
|---|---|
| `DATABASE_URL` | path to the SQLite file, `file:./dev.db` |
| `JWT_SECRET` | signs and verifies the JWTs; at least 32 random characters |
| `PORT` | API port, defaults to 3333 |

[env.ts](../server/src/env.ts) validates all three at startup with zod: if one is missing, or the
secret is too short, the server refuses to boot.

`mobile/.env` — no secrets, just the API address. See
[mobile-app.md](mobile-app.md#configuration).

## Everyday commands

```bash
# server/
npm run dev          # start the API with hot reload
npm run typecheck    # type check
npm run db:migrate   # create a migration after changing the schema
npm run db:studio    # browse the database

# mobile/
npx expo start       # start the app (QR code for Expo Go)
npx expo start -c    # same, clearing the cache — use after changing .env
npx tsc --noEmit     # type check
```

## Manual tests

With the API running (`npm run dev`), in PowerShell.

### Happy path

```powershell
$a = Invoke-RestMethod -Method Post http://localhost:3333/auth/register -ContentType 'application/json' -Body '{"email":"a@test.com","password":"secret123"}'
$hA = @{ Authorization = "Bearer $($a.accessToken)" }

$todo = Invoke-RestMethod -Method Post http://localhost:3333/todos -Headers $hA -ContentType 'application/json' -Body '{"title":"My task"}'
Invoke-RestMethod http://localhost:3333/todos -Headers $hA
```

### Authorization test

The most important test in the project: user B must not touch user A's task.

```powershell
$b = Invoke-RestMethod -Method Post http://localhost:3333/auth/register -ContentType 'application/json' -Body '{"email":"b@test.com","password":"secret123"}'
$hB = @{ Authorization = "Bearer $($b.accessToken)" }

Invoke-RestMethod http://localhost:3333/todos -Headers $hB                                  # empty list
Invoke-RestMethod -Method Delete "http://localhost:3333/todos/$($todo.id)" -Headers $hB      # 404
Invoke-RestMethod -Method Patch  "http://localhost:3333/todos/$($todo.id)" -Headers $hB -ContentType 'application/json' -Body '{"done":true}'   # 404
```

### Refresh token rotation

```powershell
$new = Invoke-RestMethod -Method Post http://localhost:3333/auth/refresh -ContentType 'application/json' -Body "{`"refreshToken`":`"$($a.refreshToken)`"}"
# reusing the SAME token → 401, and $new stops working too
Invoke-RestMethod -Method Post http://localhost:3333/auth/refresh -ContentType 'application/json' -Body "{`"refreshToken`":`"$($a.refreshToken)`"}"
```

### Tampered token

Change one character in the middle of the `accessToken` and repeat any request: the answer must be
401, because the signature no longer matches.

## Troubleshooting

**The app cannot reach the API.** Almost always the address: on a phone, `localhost` is the phone
itself. Check `EXPO_PUBLIC_API_URL`, confirm both devices are on the same network, and allow Node
through the Windows firewall for **private networks**. To test, open `http://YOUR-IP:3333/health`
in the phone's browser.

**I changed `.env` and nothing happened.** Expo bakes the variables into the bundle: restart with
`npx expo start -c`.

**`Cannot find name 'process'`.** The file was probably saved without the `.ts` extension, leaving
it outside the TypeScript project. Check the filename and restart the editor's type server
(`TypeScript: Restart TS Server`). Installing `@types/node` in the app is **not** the fix.

**`Prisma Studio is not supported for the "file:./dev.db" protocol`.** Use `npm run db:studio`, not
`npx prisma studio`. The reason is in [database.md](database.md#prisma-studio).

**Every request returns 401.** The access token expired (15 minutes). In the app the refresh is
automatic; in manual tests, sign in again or call `/auth/refresh`.

**I got logged out for no reason.** Most likely the same refresh token was used twice, and reuse
detection revoked the sessions. See [authentication.md](authentication.md#reuse-detection).

## Git workflow

```bash
git add -A
git commit -m "describe what changed"
git push
```

`.env`, `dev.db`, `node_modules/` and the generated Prisma Client are all in `.gitignore`. It is
worth checking on GitHub now and then that no `.env` has shown up in the file listing.
