'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  companyId?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Session refresh interval (5 minutes before expiry)
const SESSION_REFRESH_INTERVAL = 19 * 60 * 1000; // 19 minutes

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTimer, setRefreshTimer] = useState<NodeJS.Timeout | null>(null);
  const router = useRouter();

  const isAuthenticated = !!user;

  // Clear refresh timer
  const clearRefreshTimer = useCallback(() => {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      setRefreshTimer(null);
    }
  }, [refreshTimer]);

  // Setup session refresh timer - simplified to avoid circular dependencies
  const setupRefreshTimer = () => {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }
    const timer = setTimeout(() => {
      refreshSession();
    }, SESSION_REFRESH_INTERVAL);
    setRefreshTimer(timer);
  };

  // Refresh session
  const refreshSession = async () => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include', // Include cookies
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        
        // Store new token in localStorage as backup
        if (data.sessionToken) {
          localStorage.setItem('session_token', data.sessionToken);
        }
        
        // Setup next refresh
        if (refreshTimer) {
          clearTimeout(refreshTimer);
        }
        const timer = setTimeout(() => {
          refreshSession();
        }, SESSION_REFRESH_INTERVAL);
        setRefreshTimer(timer);
      } else {
        // Session expired, clear and redirect
        setUser(null);
        localStorage.removeItem('session_token');
        localStorage.removeItem('csrf_token');
        if (refreshTimer) {
          clearTimeout(refreshTimer);
          setRefreshTimer(null);
        }
      }
    } catch (error) {
      console.error('Session refresh failed:', error);
    }
  };

  // Clear authentication state
  const clearAuthState = useCallback(() => {
    setUser(null);
    localStorage.removeItem('session_token');
    localStorage.removeItem('csrf_token');
    clearRefreshTimer();
  }, [clearRefreshTimer]);

  // Check for existing session on mount
  const checkAuthStatus = async () => {
    console.log('🔍 Checking auth status...');
    try {
      // First try with cookies (primary method) - remove CSRF header initially to avoid issues
      let response = await fetch('/api/auth/me', {
        credentials: 'include', // Include cookies
      });

      console.log('🔐 First auth check response:', response.status, response.ok);

      // If cookie auth fails, try with localStorage token as fallback
      if (!response.ok) {
        const token = localStorage.getItem('session_token');
        const csrf = localStorage.getItem('csrf_token');
        console.log('💾 Trying localStorage token:', token ? `present (${token.length} chars)` : 'missing');
        console.log('🔒 CSRF token:', csrf ? 'present' : 'missing');
        console.log('🗄️ All localStorage keys:', Object.keys(localStorage));
        
        if (!token) {
          console.log('❌ No token found, setting loading to false');
          setLoading(false);
          return;
        }

        response = await fetch('/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          credentials: 'include',
        });
        
        console.log('🔐 Second auth check response:', response.status, response.ok);
      }

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Auth successful, user:', data.user.email);
        setUser(data.user);
        
        // Store CSRF token if provided
        const csrfToken = response.headers.get('X-CSRF-Token');
        if (csrfToken) {
          localStorage.setItem('csrf_token', csrfToken);
          console.log('🔒 CSRF token stored');
        }
        
        // Setup refresh timer after successful auth check
        setupRefreshTimer();
      } else {
        console.log('❌ Auth failed, clearing session');
        // Invalid session, clear everything
        setUser(null);
        localStorage.removeItem('session_token');
        localStorage.removeItem('csrf_token');
        clearRefreshTimer();
      }
    } catch (error) {
      console.error('❌ Auth check failed:', error);
      setUser(null);
      localStorage.removeItem('session_token');
      localStorage.removeItem('csrf_token');
      clearRefreshTimer();
    } finally {
      console.log('🏁 Setting loading to false');
      setLoading(false);
    }
  };

  // Check for existing session on mount
  useEffect(() => {
    console.log('🚀 AuthContext mounted, checking auth status...');
    // Only run once on mount
    checkAuthStatus();

    // Cleanup on unmount
    return () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
    };
  }, []); // Empty dependency array - run only once on mount

  // Listen for storage events (logout from another tab)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'session_token' && !e.newValue) {
        // Token was removed, logout
        clearAuthState();
        router.push('/');
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [clearAuthState, router]);

  // Login function
  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      console.log('🔐 Attempting login...');
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      console.log('📡 Login response:', response.status, response.ok);
      console.log('📦 Login data:', data);

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      // Store the session token in localStorage as backup
      if (data.data.sessionToken) {
        console.log('💾 Storing session token in localStorage');
        localStorage.setItem('session_token', data.data.sessionToken);
        console.log('✅ Token stored, length:', data.data.sessionToken.length);
      } else {
        console.log('❌ No session token in response');
      }
      
      // Store CSRF token
      const csrfToken = response.headers.get('X-CSRF-Token');
      if (csrfToken) {
        console.log('🔒 Storing CSRF token');
        localStorage.setItem('csrf_token', csrfToken);
      }
      
      // Set the user immediately
      console.log('👤 Setting user:', data.data.user.email);
      setUser(data.data.user);
      
      // Setup refresh timer for the new session
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      const timer = setTimeout(() => {
        refreshSession();
      }, SESSION_REFRESH_INTERVAL);
      setRefreshTimer(timer);

      console.log('✅ Login successful');
      return true;
    } catch (error) {
      console.error('❌ Login error:', error);
      return false;
    }
  };

  // Logout function
  const logout = async () => {
    try {
      // Get token from localStorage or cookie
      const token = localStorage.getItem('session_token');
      
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: token ? {
          'Authorization': `Bearer ${token}`,
          'X-CSRF-Token': localStorage.getItem('csrf_token') || '',
        } : {},
        credentials: 'include', // Include cookies
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear local state regardless of API call result
      clearAuthState();
      router.push('/');
    }
  };

  const value = {
    user,
    loading,
    login,
    logout,
    isAuthenticated,
    refreshSession,
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