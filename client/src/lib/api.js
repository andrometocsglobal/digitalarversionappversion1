async function request(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error ?? `HTTP ${res.status}`), { status: res.status, body });
  return body;
}

export const getJSON = (path) => request(path);
export const postJSON = (path, data) => request(path, { method: 'POST', body: JSON.stringify(data) });
