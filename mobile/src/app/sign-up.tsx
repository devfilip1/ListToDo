import { Link } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { AuthForm } from '../components/AuthForm';
import { colors } from '../components/theme';

export default function SignUpScreen() {
  const { signUp } = useAuth();

  return (
    <AuthForm
      title="Create account"
      subtitle="Every user sees only their own tasks"
      submitLabel="Sign up"
      onSubmit={signUp}
      footer={
        <>
          <Text style={styles.muted}>Already have an account?</Text>
          <Link href="/sign-in" replace style={styles.link}>
            Sign in
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
