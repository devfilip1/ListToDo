import { authRequest } from './api';

export type Todo = {
  id: string;
  title: string;
  done: boolean;
};

export function listTodos() {
  return authRequest<Todo[]>('GET', '/todos');
}

export function createTodo(title: string) {
  return authRequest<Todo>('POST', '/todos', { title });
}

export function updateTodo(id: string, done: boolean) {
  return authRequest<void>('PATCH', `/todos/${id}`, { done });
}

export function deleteTodo(id: string) {
  return authRequest<void>('DELETE', `/todos/${id}`);
}