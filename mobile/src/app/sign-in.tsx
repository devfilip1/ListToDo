import { Link } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { AuthForm } from '../components/AuthForm';
import { colors } from '../components/theme';

export default function SignInScreen() {
  const { signIn } = useAuth();

  return (
    <AuthForm
      title="Sign in"
      subtitle="Access your tasks"
      submitLabel="Sign in"
      onSubmit={signIn}
      footer={
        <>
          <Text style={styles.muted}>Don&apos;t have an account?</Text>
          <Link href="/sign-up" replace style={styles.link}>
            Sign up
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
