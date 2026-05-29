const BASE = import.meta.env.VITE_API_URL || "https://prince-qr-manager-backend.fliaprince.workers.dev";

function token() {
  return localStorage.getItem("qr_token") || "";
}

async function request(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const t = token();
  if (t) headers["Authorization"] = `Bearer ${t}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({ ok: false, error: "Sin respuesta JSON" }));
  if (!res.ok && !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  get:    (path)        => request("GET",    path),
  post:   (path, body)  => request("POST",   path, body),
  put:    (path, body)  => request("PUT",    path, body),
  patch:  (path, body)  => request("PATCH",  path, body),
  delete: (path, body)  => request("DELETE", path, body),
};
