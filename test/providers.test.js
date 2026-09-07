import { describe, expect, it, vi } from 'vitest';
import { createAiService, providerForEmail } from '../server/providers.js';

describe('AI provider boundary', () => {
  it('routes only the exact verified company domain to Codex', () => {
    expect(providerForEmail('jake@lindseywebsolutions.com', 'lindseywebsolutions.com')).toBe('codex');
    expect(providerForEmail('JAKE@LINDSEYWEBSOLUTIONS.COM', 'lindseywebsolutions.com')).toBe('codex');
    expect(providerForEmail('jake@evil-lindseywebsolutions.com', 'lindseywebsolutions.com')).toBe('ollama');
    expect(providerForEmail('friend@example.com', 'lindseywebsolutions.com')).toBe('ollama');
  });

  it('uses Ollama for non-company users without spawning Codex', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ response: 'A local answer' }), { status: 200 }));
    const spawnImpl = vi.fn();
    const service = createAiService({ corporateDomain: 'lindseywebsolutions.com', ollamaUrl: 'http://ollama', ollamaModel: 'local-model', codexModel: 'codex-model', fetchImpl, spawnImpl });
    const result = await service.ask('user@example.com', 'Build a timer');
    expect(result).toMatchObject({ provider: 'ollama', model: 'local-model', answer: 'A local answer' });
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it('exposes the same server-side routing decision to authenticated account metadata', () => {
    const service = createAiService({ corporateDomain: 'lindseywebsolutions.com', ollamaUrl: 'http://ollama', ollamaModel: 'local-model', codexModel: 'codex-model' });
    expect(service.providerForEmail('member@lindseywebsolutions.com')).toBe('codex');
    expect(service.providerForEmail('member@example.com')).toBe('ollama');
  });
});
