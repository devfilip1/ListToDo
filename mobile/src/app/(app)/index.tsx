import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import { colors } from '../../components/theme';
import { createTodo, deleteTodo, listTodos, updateTodo, type Todo } from '../../services/todos';

export default function TodosScreen() {
  const { user, signOut } = useAuth();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setTodos(await listTodos());
    } catch {
      setError('Não foi possível carregar as tarefas');
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleAdd() {
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle('');
    try {
      const todo = await createTodo(title);
      setTodos((current) => [todo, ...current]);
    } catch {
      setError('Não foi possível criar a tarefa');
    }
  }

  async function handleToggle(todo: Todo) {
    // Atualização otimista: muda na tela antes da resposta e desfaz se der erro.
    setTodos((current) => current.map((t) => (t.id === todo.id ? { ...t, done: !t.done } : t)));
    try {
      await updateTodo(todo.id, !todo.done);
    } catch {
      setTodos((current) => current.map((t) => (t.id === todo.id ? todo : t)));
      setError('Não foi possível atualizar a tarefa');
    }
  }

  async function handleDelete(todo: Todo) {
    const previous = todos;
    setTodos((current) => current.filter((t) => t.id !== todo.id));
    try {
      await deleteTodo(todo.id);
    } catch {
      setTodos(previous);
      setError('Não foi possível apagar a tarefa');
    }
  }

  const pending = todos.filter((t) => !t.done).length;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.greeting}>Minhas tarefas</Text>
          <Text style={styles.email} numberOfLines={1}>
            {user?.email}
          </Text>
        </View>
        <Pressable onPress={signOut} style={styles.logout} hitSlop={8}>
          <Text style={styles.logoutText}>Sair</Text>
        </Pressable>
      </View>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={newTitle}
          onChangeText={setNewTitle}
          placeholder="Nova tarefa..."
          placeholderTextColor={colors.muted}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
        />
        <Pressable
          onPress={handleAdd}
          style={({ pressed }) => [styles.addButton, pressed && { backgroundColor: colors.primaryPressed }]}
        >
          <Text style={styles.addText}>+</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={todos}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListHeaderComponent={
            todos.length > 0 ? (
              <Text style={styles.counter}>
                {pending} pendente{pending === 1 ? '' : 's'} de {todos.length}
              </Text>
            ) : null
          }
          ListEmptyComponent={<Text style={styles.empty}>Nenhuma tarefa ainda. Crie a primeira!</Text>}
          renderItem={({ item }) => (
            <View style={styles.item}>
              <Pressable style={styles.itemMain} onPress={() => handleToggle(item)}>
                <View style={[styles.checkbox, item.done && styles.checkboxDone]}>
                  {item.done && <Text style={styles.check}>✓</Text>}
                </View>
                <Text style={[styles.itemTitle, item.done && styles.itemTitleDone]}>{item.title}</Text>
              </Pressable>
              <Pressable onPress={() => handleDelete(item)} hitSlop={8}>
                <Text style={styles.delete}>Apagar</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 12,
  },
  headerText: { flex: 1 },
  greeting: { fontSize: 26, fontWeight: '700', color: colors.text },
  email: { fontSize: 14, color: colors.muted, marginTop: 2 },
  logout: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  logoutText: { color: colors.danger, fontWeight: '600' },
  inputRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 10 },
  input: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.text,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: { color: '#fff', fontSize: 26, fontWeight: '500', marginTop: -2 },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerBg,
    marginHorizontal: 20,
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
  },
  list: { padding: 20, gap: 10 },
  counter: { color: colors.muted, fontSize: 13, marginBottom: 4 },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40, fontSize: 15 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  itemMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  check: { color: '#fff', fontSize: 14, fontWeight: '700' },
  itemTitle: { flex: 1, fontSize: 16, color: colors.text },
  itemTitleDone: { color: colors.muted, textDecorationLine: 'line-through' },
  delete: { color: colors.danger, fontSize: 14, fontWeight: '500' },
});
