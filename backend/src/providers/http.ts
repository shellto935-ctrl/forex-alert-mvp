export async function parseProviderResponse(response: Response): Promise<{ json: Record<string, unknown>; text: string }> {
  const text = (await response.text()).slice(0, 4000);
  try {
    return { json: JSON.parse(text) as Record<string, unknown>, text };
  } catch {
    return { json: {}, text };
  }
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}
