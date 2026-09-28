# Mobile app

React Native with Expo and Expo Router, running in Expo Go with no native build.

## Routes

Every file under [src/app/](../mobile/src/app/) is a route:

| file | route | protected |
|---|---|---|
| [sign-in.tsx](../mobile/src/app/sign-in.tsx) | `/sign-in` | no |
| [sign-up.tsx](../mobile/src/app/sign-up.tsx) | `/sign-up` | no |
| [(app)/index.tsx](../mobile/src/app/%28app%29/index.tsx) | `/` | yes |

The parentheses in `(app)` mark a **group**: it organizes the protected screens without adding a
segment to the URL.

### What decides which screens exist

The root [_layout.tsx](../mobile/src/app/_layout.tsx):

```tsx
<Stack screenOptions={{ headerShown: false }}>
  <Stack.Protected guard={!!user}>
    <Stack.Screen name="(app)" />
  </Stack.Protected>

  <Stack.Protected guard={!user}>
    <Stack.Screen name="sign-in" />
    <Stack.Screen name="sign-up" />
  </Stack.Protected>
</Stack>
```

With `Stack.Protected`, the screens of the other group simply **do not exist** in the navigator.
This is not a redirect after rendering: there is no way to land on the task list without a
session, not even through a deep link. When `user` changes — sign in, sign out, expired session —
Expo Router swaps groups on its own.

While `isLoading` is `true`, the splash screen stays up. Without that, the app would flash the
sign-in screen before restoring the session.

## Layers

```
screens  →  useAuth() / services/todos.ts  →  services/api.ts  →  API
```

Screens never call `fetch` and never touch a token. [api.ts](../mobile/src/services/api.ts) never
knows what a task is. Replacing the whole API touches a single file.

### AuthContext

[src/auth/AuthContext.tsx](../mobile/src/auth/AuthContext.tsx) exposes the `useAuth()` hook:

```ts
const { user, isLoading, signIn, signUp, signOut } = useAuth();
```

On mount it does two things:

1. `api.setOnSessionExpired(() => setUser(null))` — wires the HTTP client to React. If the session
   dies mid-use, the app returns to sign-in with no navigation code.
2. `api.refreshSession()` — restores the session of someone who was already signed in.

`signIn` and `signUp` let errors bubble up; the form is what displays the message.

### HTTP client

[src/services/api.ts](../mobile/src/services/api.ts) owns everything session-related: SecureStore,
the in-memory token, automatic renewal and an `ApiError` carrying the status code. The details,
including why there is only ever one refresh in flight, are in
[authentication.md](authentication.md#the-app-side).

Two practical notes:

- `Content-Type: application/json` is only sent when there is a body. Fastify rejects a request
  that claims to be JSON and arrives empty, which would break `DELETE`.
- `204` responses have no body, so the client does not even try to parse JSON.

### Task service

[src/services/todos.ts](../mobile/src/services/todos.ts) is one line per operation, because all
the complexity lives in `authRequest`:

```ts
export function listTodos() {
  return authRequest<Todo[]>('GET', '/todos');
}
```

No function sends a `userId`: the owner is decided by the server, from the token.

## Screens and components

[components/](../mobile/src/components/): `AuthForm` (the form shared by sign-in and sign-up, with
validation, loading state and error display), `TextField`, `Button`, and
[theme.ts](../mobile/src/components/theme.ts) with the colors.

The [task list](../mobile/src/app/%28app%29/index.tsx) uses **optimistic updates**: toggling or
deleting changes the screen immediately and rolls back if the API fails. It also supports
pull-to-refresh and an empty state.

## Configuration

`mobile/.env` (see [.env.example](../mobile/.env.example)):

```
EXPO_PUBLIC_API_URL=http://192.168.0.10:3333
```

- The `EXPO_PUBLIC_` prefix is required for the variable to reach the app — which is exactly why
  you must **never** put a secret here: the value is baked into the bundle and anyone can read it.
- On a phone, `localhost` is the phone itself. Use your computer's IP on the local network
  (`ipconfig`).
- On the Android emulator, use `http://10.0.2.2:3333`.
- After changing `.env`, restart with `npx expo start -c`.

The app name, slug and deep-link scheme (`listtodo://`) are in [app.json](../mobile/app.json).
