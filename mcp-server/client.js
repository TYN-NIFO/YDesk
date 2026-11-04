import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

export class ClaimApiClient {
  constructor(baseUrl = process.env.API_BASE_URL || 'http://localhost:5000') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = process.env.AUTH_TOKEN || null;
    this.user = null;
  }

  setToken(token) {
    this.token = token;
  }

  setUser(user) {
    this.user = user;
  }

  get isAuthenticated() {
    return !!this.token;
  }

  get currentRole() {
    return this.user?.role || null;
  }

  hasRole(...allowedRoles) {
    if (!this.user || !this.user.role) return false;
    return allowedRoles.includes(this.user.role);
  }

  async login(email, password) {
    const res = await fetch(`${this.baseUrl}/api/auth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.details || data.error || 'Authentication failed');
    }

    this.token = data.accessToken;
    this.user = data.user;
    return data;
  }

  logout() {
    this.token = null;
    this.user = null;
  }

  async getProfile() {
    if (!this.token) {
      throw new Error('Not authenticated. Please call login first.');
    }

    const res = await fetch(`${this.baseUrl}/api/auth/me/`, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to fetch profile');
    }

    this.user = data.user || data;
    return this.user;
  }

  async request(endpoint, options = {}) {
    if (!this.token) {
      throw new Error('Authentication required. Please log in with the login tool first.');
    }

    const headers = {
      'Authorization': `Bearer ${this.token}`,
      ...(options.headers || {})
    };

    const url = `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const res = await fetch(url, {
      ...options,
      headers
    });

    const contentType = res.headers.get('content-type') || '';
    let responseData;
    if (contentType.includes('application/json')) {
      responseData = await res.json();
    } else {
      const text = await res.text();
      try {
        responseData = JSON.parse(text);
      } catch {
        responseData = text;
      }
    }

    if (!res.ok) {
      const errorMsg = typeof responseData === 'object' && responseData !== null
        ? (responseData.error || responseData.message || responseData.details || JSON.stringify(responseData))
        : responseData;
      const err = new Error(errorMsg || `Request failed with status ${res.status}`);
      err.status = res.status;
      err.data = responseData;
      throw err;
    }

    return responseData;
  }

  // Helper for multipart/form-data claim submission
  async submitClaim({ claimData, filePaths = [] }) {
    if (!this.token) {
      throw new Error('Authentication required. Please log in first.');
    }

    const formData = new FormData();
    formData.append('claimData', JSON.stringify(claimData));

    const fileMapping = {};
    if (Array.isArray(filePaths) && filePaths.length > 0) {
      const mimeTypes = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.pdf': 'application/pdf'
      };

      for (let i = 0; i < filePaths.length; i++) {
        const filePath = filePaths[i];
        if (fs.existsSync(filePath)) {
          const fileName = path.basename(filePath);
          const ext = path.extname(filePath).toLowerCase();
          const mimeType = mimeTypes[ext] || 'application/octet-stream';
          const fileBuffer = fs.readFileSync(filePath);
          const blob = new Blob([fileBuffer], { type: mimeType });
          formData.append('files', blob, fileName);
          fileMapping[fileName] = 0; // Default to first line item
        }
      }
    }
    formData.append('fileMapping', JSON.stringify(fileMapping));

    const res = await fetch(`${this.baseUrl}/api/claims`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`
      },
      body: formData
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Server returned status ${res.status}: ${text.slice(0, 300)}`);
    }

    if (!res.ok) {
      const msg = data.details || data.error || (data.violations ? JSON.stringify(data.violations) : 'Failed to submit claim');
      throw new Error(msg);
    }
    return data;
  }
}
