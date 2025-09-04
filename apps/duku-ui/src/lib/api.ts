export const fetchJSON = async (url: string, opts?: RequestInit) => {
  const res = await fetch(url, { ...opts, headers: { "Content-Type": "application/json", ...(opts?.headers || {}) }});
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
};
