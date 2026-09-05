import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { api } from '../api/client';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantId?: string;
  tenantName?: string;
  isSuperadmin?: boolean;
  avatarGender?: 'boy' | 'girl' | null;
  avatarUrl?: string | null;
  impersonatedBy?: { id: string; name: string; email: string } | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
  isAuthenticated: boolean;
  exitImpersonation: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false); // Start as false to prevent flicker

  // Initialize user from localStorage on mount - synchronous
  useEffect(() => {
    const initAuth = () => {
      try {
        const token = localStorage.getItem('accessToken');
        const savedUser = localStorage.getItem('user');

        if (token && savedUser) {
          const parsedUser = JSON.parse(savedUser);
          setUser(parsedUser);
        }
      } catch (e) {
        console.error('Auth init error:', e);
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<User> => {
    const response = await api.post('/auth/login', { email, password });

    if (response.data.success) {
      const { user: userData, accessToken } = response.data.data;

      // Refresh token is set server-side as an httpOnly cookie — only the
      // short-lived access token and user profile live in localStorage.
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('user', JSON.stringify(userData));

      setUser(userData);
      return userData;
    } else {
      throw new Error(response.data.error?.message || 'Login failed');
    }
  }, []);

  const logout = useCallback(() => {
    api.post('/auth/logout').catch(() => {});
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  const updateUser = useCallback((updates: Partial<User>) => {
    const current = localStorage.getItem('user');
    if (current) {
      try {
        const parsed = JSON.parse(current);
        const updated = { ...parsed, ...updates };
        localStorage.setItem('user', JSON.stringify(updated));
        setUser(updated);
      } catch (e) {
        console.error('Update user error:', e);
      }
    }
  }, []);

  const exitImpersonation = useCallback(() => {
    const savedToken = sessionStorage.getItem('superadmin_accessToken');
    const savedUser = sessionStorage.getItem('superadmin_user');
    if (savedToken && savedUser) {
      localStorage.setItem('accessToken', savedToken);
      localStorage.setItem('user', savedUser);
      sessionStorage.removeItem('superadmin_accessToken');
      sessionStorage.removeItem('superadmin_user');
      setUser(JSON.parse(savedUser));
    } else {
      logout();
    }
  }, [logout]);

  const value = {
    user,
    loading,
    login,
    logout,
    updateUser,
    isAuthenticated: !!user,
    exitImpersonation,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
