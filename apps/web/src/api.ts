export class ApiFailure extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      ...options,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiFailure(
      0,
      'Nie można połączyć się z serwerem. Sprawdź, czy API jest uruchomione.',
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiFailure(
      response.status,
      Array.isArray(data?.message)
        ? data.message.join(' ')
        : data?.message || 'Nie udało się wykonać operacji.',
    );
  return data as T;
}
