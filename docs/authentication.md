# Authentication

How the project knows **who** is talking. The other half — what that person is allowed to see — is
in [authorization.md](authorization.md).

## The two tokens

|  | access token | refresh token |
|---|---|---|
| what it is | JWT signed with HS256 | 32 random bytes, no meaning |
| lifetime | 15 minutes | 30 days |
| where the app keeps it | in memory only | SecureStore (Keychain / Keystore) |
| what the database stores | nothing | the SHA-256 hash only |
| revocable | no, only expires | yes, by setting `revokedAt` |
| if leaked | up to 15 minutes of access | its first use exposes the theft |

A short token rides along with every request and is checked by its signature alone, with no
database round trip. A long one, this one recorded in the database, exists only to mint the first
one again — and that is what makes the session revocable.

Both are generated in [lib/tokens.ts](../server/src/lib/tokens.ts).

## What is inside the access token

A JWT is three parts separated by dots:

```
eyJhbGciOiJIUzI1NiJ9 . eyJzdWIiOiJ1c2VyLTEyMyIsImV4cCI6MTc5MH0 . I7CGwWjf-a_WZ6bBmapW1-es...
      header                          payload                              signature
   {"alg":"HS256"}        {"sub": id, "email": ..., "exp": ...}    HMAC-SHA256(h.p, JWT_SECRET)
```

- **Header and payload are base64url**, not encryption. Anyone can decode them. That is why the
  payload carries only `sub` (the user id), `email` and `exp` — never a password or sensitive data.
- **The signature does not contain the secret.** It is the output of an HMAC-SHA256, a one-way
  function. It is always 43 characters regardless of the input size, so there is no way to run the
  computation backwards and recover the `JWT_SECRET`.
- Changing a single character of the payload changes the whole signature. Since only the holder of
  the secret can recompute it, a token cannot be forged — and that is what `jwtVerify` checks.

`verifyAccessToken` pins `algorithms: ['HS256']` on purpose: without it, a token claiming
`alg: "none"` could skip signature verification entirely.

## Registration and login

Routes in [routes/auth.ts](../server/src/routes/auth.ts).

**Registration** (`POST /auth/register`): validates the body, rejects a duplicate email with 409,
stores `argon2.hash(password)` and returns the token pair right away, so the user lands straight
in the app.

**Login** (`POST /auth/login`): looks the user up, compares with `argon2.verify` and returns the
tokens.

Two precautions live in that route:

1. **The same response** for "no such email" and "wrong password": 401 with an identical message.
   Different responses would reveal which emails are registered.
2. **The same timing** in both cases. `argon2.verify` runs even when the user does not exist,
   against a throwaway hash created at startup. Without it, "no such email" would answer in about
   1 ms and "wrong password" in about 50 ms, and that gap would leak exactly what the shared
   message hides.

The password appears only in these two routes. From there on, the rest of the system works with
tokens.

## Renewal with rotation

`POST /auth/refresh` takes the refresh token, and **each refresh token is valid exactly once**:

```
RT1 (login) ──used──► revoked, issues RT2 ──used──► revoked, issues RT3 (active)
```

The step that makes this work:

```ts
const { count } = await prisma.refreshToken.updateMany({
  where: { id: stored.id, revokedAt: null },   // only revoke if still active
  data:  { revokedAt: new Date() },
});
```

The `revokedAt: null` filter makes the revocation atomic. If two requests arrive together with the
same token, the database lets only one through and the other gets `count === 0`.

### Reuse detection

`count === 0` means that token had already been used. One of two people holds a copy of it — the
owner or a thief — and there is no way to tell which. The answer is to revoke **every** session
for that user:

```ts
await prisma.refreshToken.updateMany({
  where: { userId: stored.userId, revokedAt: null },
  data:  { revokedAt: new Date() },
});
```

The user has to sign in again on every device, and the thief is left with a useless token.

**Logout** (`POST /auth/logout`) marks the token as revoked and always answers 204, even for a
token that does not exist, so it never reveals which tokens are valid.

## The app side

All of the handling lives in [services/api.ts](../mobile/src/services/api.ts).

**Where each token lives.** The access token is a variable in memory that disappears when the app
closes — which is fine, because the refresh token mints another one. The refresh token goes to
`SecureStore`, backed by the Keychain on iOS and the Keystore on Android. `AsyncStorage` would not
do: it stores plain text.

**Automatic renewal.** `authRequest` tries the request; on a 401 it refreshes the session and
retries exactly once. The user never sees that 401.

**One refresh at a time.** This is the most important line in the file:

```ts
refreshPromise ??= (async () => { /* ... */ })().finally(() => { refreshPromise = null; });
```

If three requests fail at once, all three await the **same** promise. Without it, the app would
send the same refresh token three times, and the server would — correctly — treat that as theft
and revoke the user's own session.

**A 401 and a network error are not the same thing.** A 401 on refresh means the session is dead:
clear SecureStore and call `onSessionExpired`, which takes the user back to the sign-in screen. A
network error is rethrown instead, so nobody gets logged out for stepping into an elevator.

**On app start**, [AuthContext](../mobile/src/auth/AuthContext.tsx) calls `refreshSession()`
before the first screen: if a refresh token is stored, the session is restored and the user types
nothing.

## The cycles at a glance

```
register/login ──► access (15 min) + refresh (30 days)
                         │
              every request: Authorization: Bearer <access>
                         │
                  access expired → 401
                         │
          POST /auth/refresh (one at a time) → new pair, the old one is revoked
                         │
      refresh invalid, expired or reused → 401 → sign-in screen
```

A visual diagram of this same flow is linked from the [main README](../README.md).
