const LINEAR_API_URL = "https://api.linear.app/graphql";
const MAX_RETRIES = 1;
const RETRYABLE_STATUSES = new Set([400, 429]);

function isRetryable(status: number): boolean {
  return RETRYABLE_STATUSES.has(status) || status >= 500;
}

export async function linearFetch(
  apiKey: string,
  body: { query: string; variables: Record<string, unknown> },
): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(LINEAR_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: apiKey,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await delay(backoff(attempt));
        continue;
      }
      throw err;
    }

    if (res.ok || attempt >= MAX_RETRIES) return res;

    if (isRetryable(res.status)) {
      await delay(backoff(attempt));
      continue;
    }

    return res;
  }

  throw new Error("linearFetch: unreachable");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoff(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 4000);
}
