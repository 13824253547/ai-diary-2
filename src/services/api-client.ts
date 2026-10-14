export type ApiClientOptions = {
  baseUrl: string;
  headers?: Record<string, string>;
  getHeaders?: () => Promise<Record<string, string> | undefined> | Record<string, string> | undefined;
};

export class ApiClient {
  constructor(private readonly options: ApiClientOptions) {}

  buildUrl(path: string) {
    return `${this.options.baseUrl}${path}`;
  }

  async getHeaders(extraHeaders?: Record<string, string>) {
    const resolvedHeaders = await this.options.getHeaders?.();
    return {
      ...this.options.headers,
      ...resolvedHeaders,
      ...extraHeaders,
    };
  }

  async get<T>(path: string): Promise<T> {
    const response = await fetch(this.buildUrl(path), {
      method: 'GET',
      headers: await this.getHeaders(),
    });

    return this.parse<T>(response);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(this.buildUrl(path), {
      method: 'POST',
      headers: await this.getHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(body),
    });

    return this.parse<T>(response);
  }

  private async parse<T>(response: Response): Promise<T> {
    const json = await response.json();
    if (!response.ok) {
      throw new Error(typeof json?.message === 'string' ? json.message : `HTTP ${response.status}`);
    }
    return json as T;
  }
}
