export async function apiRequest<T>(_path: string, _init?: RequestInit): Promise<T> {
  throw new Error('API client is not configured yet.');
}
