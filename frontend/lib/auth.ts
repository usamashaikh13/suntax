import Cookies from 'js-cookie';
import type { User } from '@/types';

const ACCESS_TOKEN_KEY = 'suntax_access_token';
const REFRESH_TOKEN_KEY = 'suntax_refresh_token';
const USER_KEY = 'suntax_user';

// Cookie options – in production these should be httpOnly (set server-side)
const cookieOptions: Cookies.CookieAttributes = {
  expires: 7,        // 7 days
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'Strict',
};

/**
 * Retrieves the stored access token from cookies.
 */
export function getAccessToken(): string | null {
  return Cookies.get(ACCESS_TOKEN_KEY) ?? null;
}

/**
 * Retrieves the stored refresh token from cookies.
 */
export function getRefreshToken(): string | null {
  return Cookies.get(REFRESH_TOKEN_KEY) ?? null;
}

/**
 * Persists the access and refresh tokens in cookies.
 */
export function setTokens(accessToken: string, refreshToken: string): void {
  Cookies.set(ACCESS_TOKEN_KEY, accessToken, cookieOptions);
  Cookies.set(REFRESH_TOKEN_KEY, refreshToken, {
    ...cookieOptions,
    expires: 30, // refresh token lives longer
  });
}

/**
 * Removes all auth tokens and user data from cookies/storage.
 */
export function clearTokens(): void {
  Cookies.remove(ACCESS_TOKEN_KEY);
  Cookies.remove(REFRESH_TOKEN_KEY);
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(USER_KEY);
  }
}

/**
 * Returns true if an access token exists (user is likely authenticated).
 * For a stronger check, validate the token with the backend.
 */
export function isAuthenticated(): boolean {
  return Boolean(getAccessToken());
}

/**
 * Stores the current user in session storage for quick retrieval.
 */
export function setCurrentUser(user: User): void {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  }
}

/**
 * Retrieves the current user from session storage.
 * Returns null if no user is stored.
 */
export function getCurrentUser(): User | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

/**
 * Checks if the stored user has admin privileges.
 */
export function isAdmin(): boolean {
  const user = getCurrentUser();
  return user?.is_admin === true;
}
