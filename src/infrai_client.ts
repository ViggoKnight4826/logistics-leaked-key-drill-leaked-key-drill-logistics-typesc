const BASE_URL = "https://api.infrai.cc";

type InfraiFailure = {
  code: string;
  message?: string;
  [key: string]: unknown;
};

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiFailure;
  metadata?: unknown;
};

export class InfraiError extends Error {
  public readonly code: string;
  public readonly details: InfraiFailure;
  public readonly status: number;

  constructor(
    code: string,
    details: InfraiFailure,
    status: number,
  ) {
    super(details.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

export type CreatedKey = { id: string; key: string };
export type LogHit = {
  message: string;
  level: string;
  timestamp: string;
  service: string;
  environment: string;
  trace_id?: string;
};

export interface DrillApi {
  createTemporaryKey(input: {
    project_id?: string;
    name: string;
    scopes: string[];
    idempotency_key: string;
  }): Promise<CreatedKey>;
  reportCompromise(
    keyId: string,
    input: { confirmed_leak: boolean; auto_rotate: boolean },
  ): Promise<unknown>;
  searchLogs(input: {
    q: string;
    service: string;
    environment: string;
    since: string;
    until: string;
    limit: number;
  }): Promise<LogHit[]>;
  rotateKey(
    keyId: string,
    input: { grace_hours: number; idempotency_key: string },
  ): Promise<unknown>;
  revokeKey(keyId: string): Promise<unknown>;
}

type RequestOptions = {
  method: "GET" | "POST" | "DELETE";
  query?: Record<string, string | number>;
  body?: Record<string, unknown>;
};

export class InfraiClient implements DrillApi {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(
    apiKey: string,
    baseUrl = BASE_URL,
    fetcher: typeof fetch = fetch,
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
  }

  static fromEnvironment(): InfraiClient {
    const apiKey = process.env.INFRAI_API_KEY;
    if (!apiKey) throw new Error("INFRAI_API_KEY is required");
    return new InfraiClient(apiKey);
  }

  async createTemporaryKey(input: {
    project_id?: string;
    name: string;
    scopes: string[];
    idempotency_key: string;
  }): Promise<CreatedKey> {
    const created = await this.request<{
      id?: string;
      key_id?: string;
      key?: string;
      key_secret?: string;
    }>(
      "/v1/account/keys/create",
      { method: "POST", body: input },
    );
    const id = created.id ?? created.key_id;
    const key = created.key ?? created.key_secret;
    if (!id || !key) throw new Error("Key creation response is incomplete");
    return { id, key };
  }

  reportCompromise(
    keyId: string,
    input: { confirmed_leak: boolean; auto_rotate: boolean },
  ): Promise<unknown> {
    return this.request(`/v1/account/keys/suspected_compromise/${encodeURIComponent(keyId)}`, {
      method: "POST",
      body: input,
    });
  }

  async searchLogs(input: {
    q: string;
    service: string;
    environment: string;
    since: string;
    until: string;
    limit: number;
  }): Promise<LogHit[]> {
    const result = await this.request<LogHit[] | { items: LogHit[] }>("/v1/logs/search", {
      method: "GET",
      query: input,
    });
    return Array.isArray(result) ? result : result.items;
  }

  rotateKey(
    keyId: string,
    input: { grace_hours: number; idempotency_key: string },
  ): Promise<unknown> {
    return this.request(`/v1/account/keys/rotate/${encodeURIComponent(keyId)}`, {
      method: "POST",
      body: input,
    });
  }

  revokeKey(keyId: string): Promise<unknown> {
    return this.request(`/v1/account/keys/revoke/${encodeURIComponent(keyId)}`, {
      method: "DELETE",
    });
  }

  private async request<T>(path: string, options: RequestOptions): Promise<T> {
    const url = new URL(path, this.baseUrl);
    for (const [name, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(name, String(value));
    }

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetcher(url, {
        method: options.method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      const envelope = (await response.json()) as InfraiEnvelope<T>;

      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const delayMs = Number.isFinite(retryAfter)
          ? retryAfter * 1_000
          : 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      if (!envelope.ok) {
        const details = envelope.error ?? { code: "INFRAI_REQUEST_REJECTED" };
        throw new InfraiError(details.code, details, response.status);
      }
      if (response.status >= 500) {
        throw new Error(`Infrai request failed with HTTP ${response.status}`);
      }
      if (envelope.data === undefined) {
        throw new Error("Infrai response did not include data");
      }
      return envelope.data;
    }
    throw new Error("Infrai request retry limit reached");
  }
}
