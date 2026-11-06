import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface User {
  _id: string;
  name: string;
  email: string;
  role: 'employee' | 'supervisor' | 'finance_manager' | 'executive' | 'admin';
  grievanceAccess?: 'handler' | 'summary' | null;
  supervisorLevel?: number;
  department?: string;
  isActive: boolean;
  assignedSupervisor1?: string;
  assignedSupervisor2?: string;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  isInitialized: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setTokens: (state, action: PayloadAction<{ user: User; accessToken: string; message?: string }>) => {
      state.accessToken = action.payload.accessToken;
      state.user = action.payload.user;
      state.isAuthenticated = true;
      state.error = null;
      state.isLoading = false;
      state.isInitialized = true;
      // Store tokens in localStorage
      if (typeof window !== 'undefined') {
        console.log('💾 Storing auth data to localStorage:', {
          user: action.payload.user.email,
          hasToken: !!action.payload.accessToken
        });
        localStorage.setItem('auth', JSON.stringify({
          user: action.payload.user,
          accessToken: action.payload.accessToken
        }));
      }
    },
    setUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
      state.isAuthenticated = true;
      state.error = null;
      state.isInitialized = true;
    },
    logout: (state) => {
      state.user = null;
      state.accessToken = null;
      state.isAuthenticated = false;
      state.error = null;
      state.isLoading = false;
      state.isInitialized = true;
      // Clear from localStorage
      if (typeof window !== 'undefined') {
        localStorage.removeItem('auth');
      }
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
    loadStoredAuth: (state) => {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('auth');
        if (stored) {
          try {
            const { user, accessToken } = JSON.parse(stored);
            console.log('📂 Loading stored auth data:', {
              user: user?.email,
              hasToken: !!accessToken
            });

            // Check if token is expired
            let isTokenValid = false;
            if (accessToken) {
              try {
                const payload = JSON.parse(atob(accessToken.split('.')[1]));
                const currentTime = Math.floor(Date.now() / 1000);
                isTokenValid = payload.exp > currentTime;
                console.log('🔍 Token validity check:', {
                  expires: new Date(payload.exp * 1000).toISOString(),
                  isValid: isTokenValid
                });
              } catch (error) {
                console.error('❌ Failed to decode token:', error);
                isTokenValid = false;
              }
            }

            if (isTokenValid) {
              state.user = user;
              state.accessToken = accessToken;
              state.isAuthenticated = true;
              state.error = null;
            } else {
              console.log('⚠️ Stored token is expired, clearing auth data');
              localStorage.removeItem('auth');
              state.user = null;
              state.accessToken = null;
              state.isAuthenticated = false;
            }
            state.isInitialized = true;
          } catch (error) {
            console.error('❌ Failed to parse stored auth:', error);
            localStorage.removeItem('auth');
            state.isInitialized = true;
          }
        } else {
          console.log('📂 No stored auth data found');
          state.isInitialized = true;
        }
      } else {
        state.isInitialized = true;
      }
    },
    updateProfile: (state, action: PayloadAction<Partial<User>>) => {
      if (state.user) {
        state.user = { ...state.user, ...action.payload };
        // Update localStorage
        if (typeof window !== 'undefined') {
          const stored = localStorage.getItem('auth');
          if (stored) {
            try {
              const authData = JSON.parse(stored);
              authData.user = { ...authData.user, ...action.payload };
              localStorage.setItem('auth', JSON.stringify(authData));
            } catch (error) {
              console.error('❌ Failed to update stored auth:', error);
            }
          }
        }
      }
    },
  },
});

export const {
  setTokens,
  setUser,
  logout,
  setLoading,
  setError,
  clearError,
  loadStoredAuth,
  updateProfile
} = authSlice.actions;
export default authSlice.reducer;
