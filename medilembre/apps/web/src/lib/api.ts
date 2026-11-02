export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** fetch para /api com cookies de sessão. Nunca rebenta com "Unexpected token <": valida o JSON. */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(new URL(path, process.env.API_URL), {
    method: init.method ?? "GET",
    credentials: "same-origin",
    headers: { "x-ml": "1", ...(init.body !== undefined ? { "content-type": "application/json" } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const isJson = (res.headers.get("content-type") ?? "").includes("json");
  const data = isJson ? await res.json() : null;
  if (!isJson) throw new ApiError(res.status, "O servidor não respondeu como esperado (proxy /api em falta?)");
  if (!res.ok) {
    const e = (data as { error?: unknown })?.error;
    throw new ApiError(res.status, typeof e === "string" ? e : "Dados inválidos");
  }
  return data as T;
}

export const isOffline = (e: unknown) => e instanceof TypeError; // fetch falhou: sem rede
