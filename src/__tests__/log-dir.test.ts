import { describe, it, expect, vi } from 'vitest';

// Mock the event router so no actual processing happens
vi.mock('../handlers/event-router.js', () => ({
  processEvents: vi.fn().mockResolvedValue(undefined),
}));

// Mock LINE SDK middleware (unrelated route, kept for consistency with app import)
vi.mock('@line/bot-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@line/bot-sdk')>();
  return {
    ...actual,
    middleware: () => (_req: any, _res: any, next: any) => next(),
  };
});

describe('resolveLogDir', () => {
  it('resolves to <project root>/logs when the entry file is the dev src/index.ts', async () => {
    const { resolveLogDir } = await import('../index.js');
    expect(resolveLogDir('/Users/shiu/repos/dobby/src/index.ts')).toBe(
      '/Users/shiu/repos/dobby/logs'
    );
  });

  it('resolves to <project root>/logs when the entry file is the built dist/index.cjs', async () => {
    const { resolveLogDir } = await import('../index.js');
    expect(resolveLogDir('/app/dist/index.cjs')).toBe('/app/logs');
  });
});
