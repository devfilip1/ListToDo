import { Link } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { AuthForm } from '../components/AuthForm';
import { colors } from '../components/theme';

export default function SignUpScreen() {
  const { signUp } = useAuth();

  return (
    <AuthForm
      title="Criar conta"
      subtitle="Cada usuário vê só as próprias tarefas"
      submitLabel="Cadastrar"
      onSubmit={signUp}
      footer={
        <>
          <Text style={styles.muted}>Já tem conta?</Text>
          <Link href="/sign-in" replace style={styles.link}>
            Entrar
          </Link>
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  muted: { color: colors.muted, fontSize: 15 },
  link: { color: colors.primary, fontSize: 15, fontWeight: '600' },
});
