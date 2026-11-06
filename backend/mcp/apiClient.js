import { MCP_INTERNAL_HEADER, MCP_INTERNAL_SECRET } from './internal.js';

// the MCP request. Every call still runs that route's auth, RBAC and policy
// validation, so tools can never do more than the user could in the web app.
export class LoopbackApiClient {
  constructor(port, token) {
    this.baseUrl = `http://127.0.0.1:${port}`;
    this.token = token;
  }

  async request(path, { method = 'GET', json, formData } = {}) {
    const headers = {
      Authorization: `Bearer ${this.token}`,
      [MCP_INTERNAL_HEADER]: MCP_INTERNAL_SECRET
    };

    let body;
    if (formData) {
      body = formData;
    } else if (json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    }

    const res = await fetch(`${this.baseUrl}${path}`, { method, headers, body });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (!res.ok) {
      const err = new Error(errorMessage(data) || `Request failed with status ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  }
}

function errorMessage(data) {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data.violations) && data.violations.length > 0) {
    return data.violations.map((v) => v.message || JSON.stringify(v)).join('; ');
  }
  return data.details || data.error || data.message;
}
