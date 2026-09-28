import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from './Button';
import { TextField } from './TextField';
import { colors } from './theme';

type Props = {
  title: string;
  subtitle: string;
  submitLabel: string;
  onSubmit: (email: string, password: string) => Promise<void>;
  footer: React.ReactNode;
};

/** Formulário compartilhado pelas telas de login e cadastro. */
export function AuthForm({ title, subtitle, submitLabel, onSubmit, footer }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!email.trim() || !password) {
      setError('Fill in your email and password');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await onSubmit(email.trim().toLowerCase(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        <View style={styles.form}>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@email.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            secureTextEntry
            autoComplete="password"
            textContentType="password"
            onSubmitEditing={handleSubmit}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <Button title={submitLabel} onPress={handleSubmit} loading={loading} />
        </View>

        <View style={styles.footer}>{footer}</View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 32 },
  header: { gap: 8 },
  title: { fontSize: 30, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 16, color: colors.muted },
  form: { gap: 16 },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerBg,
    padding: 12,
    borderRadius: 8,
    fontSize: 14,
  },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 4 },
});
