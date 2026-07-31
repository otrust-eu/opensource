import { describe, expect, it, vi } from 'vitest';
import { Client } from './client.js';

describe('Client retries', () => {
  it('uses the canonical production API host', () => {
    expect(new Client().baseUrl).toBe('https://www.otrust.eu');
  });

  it('reuses one automatic idempotency key across POST retries', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ error: 'server_error' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      ))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ ok: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      ));
    const client = new Client({
      fetch: fetchMock as typeof fetch,
      retries: 1
    });

    const result = await client.post<{ ok: boolean }>('/claim/simple', { hash: 'a'.repeat(64) });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstHeaders = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    const secondHeaders = fetchMock.mock.calls[1][1]?.headers as Record<string, string>;
    expect(firstHeaders['Idempotency-Key']).toMatch(/^sdk_/);
    expect(secondHeaders['Idempotency-Key']).toBe(firstHeaders['Idempotency-Key']);
  });

  it('preserves an explicit idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    ));
    const client = new Client({ fetch: fetchMock as typeof fetch, retries: 0 });

    await client.post('/claim/simple', {}, { idempotencyKey: 'customer-request-123' });

    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe('customer-request-123');
  });
});
