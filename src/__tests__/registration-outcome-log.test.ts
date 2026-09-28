import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'module';
import { createTestBot } from '../test-utils/index.js';
import { logger } from '../utils/logger.js';

vi.mock('../services/notion/notion-fetch.js');
vi.mock('../config/line.js');
vi.mock('../services/mutex.js');
// logger is a Proxy over pino, so vi.spyOn can't hook it — mock the module instead.
vi.mock('../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const require = createRequire(import.meta.url);

/** Default fixture page with some properties replaced — for calendar/season overrides. */
function fixtureWith(name: 'calendar' | 'season', properties: Record<string, unknown>) {
  const base = structuredClone(require(`../test-utils/fixtures/${name}.json`));
  Object.assign(base.results[0].properties, properties);
  return { results: base.results };
}

/** 1 court × 7 − 2 season members = 5 slots, all taken by guests. */
function fullCalendar() {
  return fixtureWith('calendar', {
    場地數: { type: 'number', number: 1 },
    零打: { type: 'multi_select', multi_select: ['G1', 'G2', 'G3', 'G4', 'G5'].map((name) => ({ name })) },
  });
}

function outcomes(msg: string): Array<Record<string, unknown>> {
  return vi
    .mocked(logger.info)
    .mock.calls.filter(([, m]) => m === msg)
    .map(([fields]) => fields as unknown as Record<string, unknown>);
}

// End-to-end through message-handler → router → handler, so a branch that forgets its
// outcome line (or logs it twice, or at warn) shows up here.
describe('registration/leave outcome log (createTestBot)', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Registration handler outcome', () => {
    it('added', async () => {
      await createTestBot().run('@Dobby +1', { userId: 'user-alice' });

      expect(outcomes('Registration handler outcome')).toEqual([
        expect.objectContaining({ outcome: 'added', requestedDelta: 1, isSelfSeasonMember: true, resolvedVia: 'self', guestCountAfter: 1 }),
      ]);
    });

    it('full', async () => {
      const bot = createTestBot({ calendar: fullCalendar() });
      await bot.run('@Dobby +1', { userId: 'user-alice' });

      expect(outcomes('Registration handler outcome')).toEqual([
        expect.objectContaining({ outcome: 'full', courts: 1, totalSlots: 5, guestCountBefore: 5 }),
      ]);
      expect(bot.notionPatchSpy).not.toHaveBeenCalled();
    });

    it('no-registration', async () => {
      await createTestBot().run('@Dobby -1', { userId: 'user-alice' });

      expect(outcomes('Registration handler outcome')).toEqual([
        expect.objectContaining({ outcome: 'no-registration', requestedDelta: -1 }),
      ]);
    });

    it('event-not-found (logged by withFreshCalendarEvent, with only the date)', async () => {
      await createTestBot({ calendar: { results: [] } }).run('@Dobby +1', { userId: 'user-alice' });

      expect(outcomes('Registration handler outcome')).toEqual([
        { outcome: 'event-not-found', date: expect.any(String) },
      ]);
    });
  });

  describe('Leave handler outcome', () => {
    it('leave-recorded', async () => {
      await createTestBot().run('@Dobby 假', { userId: 'user-alice' });

      expect(outcomes('Leave handler outcome')).toEqual([
        expect.objectContaining({ outcome: 'leave-recorded', totalSlotsBefore: 19, totalSlotsAfter: 20, absenteeCountAfter: 1 }),
      ]);
    });

    it('already-absent', async () => {
      const bot = createTestBot({
        calendar: fixtureWith('calendar', { 請假人: { type: 'relation', relation: [{ id: 'person-1' }], has_more: false } }),
      });
      await bot.run('@Dobby 假', { userId: 'user-alice' });

      expect(outcomes('Leave handler outcome')).toEqual([
        expect.objectContaining({ outcome: 'already-absent', absenteeCountBefore: 1 }),
      ]);
      expect(bot.notionPatchSpy).not.toHaveBeenCalled();
    });

    it('not-absent', async () => {
      await createTestBot().run('@Dobby 銷假', { userId: 'user-alice' });

      expect(outcomes('Leave handler outcome')).toEqual([expect.objectContaining({ outcome: 'not-absent', isCancel: true })]);
    });

    it('not-season-member', async () => {
      const bot = createTestBot({
        season: fixtureWith('season', { 報名人: { type: 'relation', relation: [{ id: 'person-2' }], has_more: false } }),
      });
      await bot.run('@Dobby 假', { userId: 'user-alice' });

      expect(outcomes('Leave handler outcome')).toEqual([expect.objectContaining({ outcome: 'not-season-member' })]);
    });

    it('event-not-found', async () => {
      await createTestBot({ calendar: { results: [] } }).run('@Dobby 假', { userId: 'user-alice' });

      expect(outcomes('Leave handler outcome')).toEqual([{ outcome: 'event-not-found', date: expect.any(String) }]);
    });
  });

  it('never logs an outcome at warn, and never puts a userId or name in a rejection/no-op info summary', async () => {
    const bot = createTestBot({ calendar: fullCalendar() });
    await bot.run('@Dobby +1', { userId: 'user-alice' });
    await bot.run('@Dobby -1', { userId: 'user-alice' });
    await bot.run('@Dobby 銷假', { userId: 'user-alice' });

    expect(vi.mocked(logger.warn).mock.calls.filter(([, m]) => String(m).endsWith('outcome'))).toEqual([]);
    const summaries = [...outcomes('Registration handler outcome'), ...outcomes('Leave handler outcome')];
    expect(summaries.map((x) => x['outcome'])).toEqual(['full', 'no-registration', 'not-absent']);
    // Alice (person-1) is the target; guest entries would read "Alice的朋友".
    expect(JSON.stringify(summaries)).not.toMatch(/user-alice|Alice|的朋友/);
  });
});
