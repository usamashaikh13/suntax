'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import { getCurrentUser, clearTokens, setCurrentUser } from '@/lib/auth';
import type { User, RegisterRequest } from '@/types';

interface UseAuthReturn {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  refreshUser: () => Promise<void>;
}

/**
 * Custom hook encapsulating authentication state and actions.
 * Uses session-stored user data for fast initial render.
 */
export function useAuth(): UseAuthReturn {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(() => {
    // Hydrate from session storage on first render (client only)
    if (typeof window !== 'undefined') {
      return getCurrentUser();
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(
    async (email: string, password: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await authApi.login({ email, password });
        if (response.user) {
          setUser(response.user);
          setCurrentUser(response.user);
        }
        router.push('/dashboard');
        router.refresh();
      } catch (err: unknown) {
        const message =
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          'Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [router],
  );

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await authApi.logout();
    } catch {
      // Logout locally even if API call fails
    } finally {
      clearTokens();
      setUser(null);
      setIsLoading(false);
      router.push('/login');
      router.refresh();
    }
  }, [router]);

  const register = useCallback(async (data: RegisterRequest) => {
    setIsLoading(true);
    setError(null);
    try {
      await authApi.register(data);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Registrierung fehlgeschlagen. Bitte versuchen Sie es erneut.';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const me = await authApi.getMe();
      setUser(me);
    } catch {
      // Silently fail — user will be redirected by middleware if token expired
    }
  }, []);

  return { user, isLoading, error, login, logout, register, refreshUser };
}
