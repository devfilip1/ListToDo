import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3333';
const REFRESH_TOKEN_KEY = 'refreshToken';

export type User = { id: string; email: string };

type AuthResponse = {
    accessToken: string;
    refreshToken: string;
    user: User;
};

export class ApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}


// O access token fica só na memória. O refresh token fica no SecureStore.
let accessToken: string | null = null;
let refreshPromise: Promise<User | null> | null = null;
let onSessionExpired: (() => void) | null = null;

export function setOnSessionExpired(callback: () => void) {
    onSessionExpired = callback;
}

async function saveSession(data: AuthResponse) {
    accessToken = data.accessToken;
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, data.refreshToken);
    return data.user;
}

async function clearSession() {
    accessToken = null;
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

async function request<T>(method: string, path: string, body?: unknown, token?: string | null): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${API_URL}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (response.status === 204) return undefined as T;

    const data = await response.json().catch(() => null);
    if (!response.ok) {
        throw new ApiError(response.status, data?.error ?? 'Erro inesperado');
    }
    return data as T;
}

export async function login(email: string, password: string) {
    return saveSession(await request<AuthResponse>('POST', '/auth/login', { email, password }));
}

export async function register(email: string, password: string) {
    return saveSession(await request<AuthResponse>('POST', '/auth/register', { email, password }));
}

export async function logout() {
    const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    if (refreshToken) {
        await request('POST', '/auth/logout', { refreshToken }).catch(() => { });
    }
    await clearSession();
}

export function refreshSession(): Promise<User | null> {
    refreshPromise ??= (async () => {
        const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
        if (!refreshToken) return null;

        try {
            return saveSession(await request<AuthResponse>('POST', '/auth/refresh', { refreshToken }));
        } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
                await clearSession();
                return null;
            }
            throw error;
        }
    })().finally(() => {
        refreshPromise = null;
    });

    return refreshPromise;
}

export async function authRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    try {
        return await request<T>(method, path, body, accessToken);
    } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
    }

    const user = await refreshSession();
    if (!user) {
        onSessionExpired?.();
        throw new ApiError(401, 'Sua sessão expirou, entre novamente');
    }

    return request<T>(method, path, body, accessToken);
}