const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;

if (!API_BASE_URL) {
  // eslint-disable-next-line no-console
  console.warn("VITE_API_BASE_URL is not set; API calls will fail until configured.");
}

// PUBLIC_INTERFACE
export async function apiFetch(path: string, init?: RequestInit) {
  /**
   * Wrapper around fetch to call the backend API.
   */
  const url = `${API_BASE_URL}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {})
    }
  });
}
