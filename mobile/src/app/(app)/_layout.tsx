import { Stack } from 'expo-router';

// Grupo de telas protegidas (só aparece com usuário logado — ver src/app/_layout.tsx).
export default function AppLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
