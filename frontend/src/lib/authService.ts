import { store } from './store';
import { setTokens, logout } from './slices/authSlice';

class AuthService {
  private refreshPromise: Promise<any> | null = null;
  private isRefreshing = false;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  // Get access token from store
  getAccessToken(): string | null {
    const state = store.getState() as any;
    return state.auth.accessToken;
  }

  // Get refresh token from cookies
  getRefreshToken(): string | null {
    // This will be handled by the browser automatically via credentials: 'include'
    return null;
  }

  // Authenticate user with credentials
  async authenticate(credentials: { email: string; password: string }) {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/auth/token/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || 'Authentication failed');
      }

      const data = await response.json();
      
      // Store tokens in Redux
      store.dispatch(setTokens({
        user: data.user,
        accessToken: data.accessToken,
        message: data.message
      }));

      return data;
    } catch (error) {
      console.error('Authentication error:', error);
      throw error;
    }
  }

  // Refresh access token with race condition protection
  async refreshToken(): Promise<string | null> {
    // Prevent multiple simultaneous refresh requests
    if (this.isRefreshing) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = this.performRefresh();

    try {
      const result = await this.refreshPromise;
      return result;
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
  }

  private async performRefresh(): Promise<string | null> {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/auth/refresh/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const data = await response.json();
      
      // Update tokens in Redux
      store.dispatch(setTokens({
        user: data.user,
        accessToken: data.accessToken,
        message: data.message
      }));

      this.setupAutoRefresh();
      return data.accessToken;
    } catch (error) {
      console.error('Token refresh error:', error);
      // Clear auth state on refresh failure
      store.dispatch(logout());
      return null;
    }
  }

  // Logout user
  async logout() {
    try {
      const token = this.getAccessToken();
      
      if (token) {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/auth/logout/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          credentials: 'include',
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      if (this.refreshTimer) clearTimeout(this.refreshTimer);
      // Clear auth state regardless of API call success
      store.dispatch(logout());
    }
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    const state = store.getState() as any;
    return state.auth.isAuthenticated && !!state.auth.accessToken;
  }

  // Get current user
  getCurrentUser() {
    const state = store.getState() as any;
    return state.auth.user;
  }

  // Check if token is expired (basic check)
  isTokenExpired(token: string): boolean {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const currentTime = Math.floor(Date.now() / 1000);
      return payload.exp < currentTime;
    } catch (error) {
      return true;
    }
  }

  // Get token expiration time
  getTokenExpiration(token: string): Date | null {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return new Date(payload.exp * 1000);
    } catch (error) {
      return null;
    }
  }

  // Auto-refresh token before expiration
  setupAutoRefresh() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    const token = this.getAccessToken();
    if (!token) return;

    const expiration = this.getTokenExpiration(token);
    if (!expiration) return;

    // Refresh token 5 minutes before expiration
    const refreshTime = expiration.getTime() - (5 * 60 * 1000);
    const now = Date.now();

    if (refreshTime > now) {
      this.refreshTimer = setTimeout(() => {
        this.refreshToken();
      }, refreshTime - now);
    } else {
      // Token is already expired or close to expiring, refresh immediately
      this.refreshToken();
    }
  }
}

export const authService = new AuthService();
export default authService;
