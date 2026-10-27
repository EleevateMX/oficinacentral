export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  if (!res.ok) throw new ApiError(data?.error || `Error ${res.status}`, res.status);
  return data;
}

api.get = (p) => api(p);
api.post = (p, body = {}) => api(p, { method: 'POST', body });
api.patch = (p, body = {}) => api(p, { method: 'PATCH', body });
api.put = (p, body = {}) => api(p, { method: 'PUT', body });
api.del = (p) => api(p, { method: 'DELETE' });
