const NEXUS_API_URL = process.env.NEXUS_API_URL || "http://localhost:3001";

interface FetchOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | undefined>;
}

export async function fetchApi(path: string, options: FetchOptions = {}): Promise<Response> {
  const { method = "GET", body, query } = options;

  let url = `${NEXUS_API_URL}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, value);
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  return response;
}

export function success(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export function jsonResponse(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export function errorResponse(msg: string) {
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }] };
}

export async function apiCall(path: string, options: FetchOptions = {}) {
  try {
    const response = await fetchApi(path, options);
    const data = await response.json();
    if (!response.ok) {
      const errMsg = (data as Record<string, unknown>).error || (data as Record<string, unknown>).message || response.statusText;
      return errorResponse(`${response.status} ${errMsg}`);
    }
    return jsonResponse(data);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : String(err));
  }
}
