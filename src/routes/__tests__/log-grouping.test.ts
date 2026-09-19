import { describe, it, expect } from 'vitest';
import { groupPairedEntries, buildFlowGroups, type NotionCallRow, type LineSendRow } from '../log-grouping.js';
import type { LogEntry } from '../../utils/log-reader.js';

let t = 0;
function entry(partial: Partial<LogEntry> & { msg: string }): LogEntry {
  t += 1;
  return { level: 30, time: t, ...partial } as LogEntry;
}

describe('groupPairedEntries', () => {
  it('merges a single successful Notion call into one notion-call row', () => {
    const entries = [
      entry({ msg: 'Notion API request', method: 'GET', path: '/pages/abc', db: 'people', reqId: 'r1' }),
      entry({ level: 20, msg: 'Notion API request payload', method: 'GET', path: '/pages/abc', reqId: 'r1' }),
      entry({ msg: 'Notion API response', method: 'GET', path: '/pages/abc', db: 'people', reqId: 'r1' }),
      entry({ level: 20, msg: 'Notion API response payload', method: 'GET', path: '/pages/abc', result: { ok: true }, reqId: 'r1' }),
    ];

    const rows = groupPairedEntries(entries);
    expect(rows).toHaveLength(1);
    const row = rows[0] as NotionCallRow;
    expect(row.kind).toBe('notion-call');
    expect(row.attempts).toBe(1);
    expect(row.requestPayload).toBeDefined();
    expect(row.response).toBeDefined();
    expect(row.responsePayload).toBeDefined();
  });

  it('collapses a 429-retried call that eventually succeeds into one row with attempts === 3', () => {
    const entries = [
      entry({ msg: 'Notion API request', method: 'GET', path: '/pages/abc', reqId: 'r1' }),
      entry({ msg: 'Notion API rate limited, retrying', method: 'GET', path: '/pages/abc', reqId: 'r1' }),
      entry({ msg: 'Notion API request', method: 'GET', path: '/pages/abc', reqId: 'r1' }),
      entry({ msg: 'Notion API rate limited, retrying', method: 'GET', path: '/pages/abc', reqId: 'r1' }),
      entry({ msg: 'Notion API request', method: 'GET', path: '/pages/abc', reqId: 'r1' }),
      entry({ msg: 'Notion API response', method: 'GET', path: '/pages/abc', reqId: 'r1' }),
    ];

    const rows = groupPairedEntries(entries);
    const notionRows = rows.filter((r): r is NotionCallRow => r.kind === 'notion-call');
    expect(notionRows).toHaveLength(1);
    expect(notionRows[0]!.attempts).toBe(3);
    expect(notionRows[0]!.response).toBeDefined();
    // the two 'rate limited, retrying' warnings stay as independent single rows
    expect(rows.filter((r) => r.kind === 'single')).toHaveLength(2);
  });

  it('collapses a 429-retried call that exhausts retries into one row with an error and no response', () => {
    const entries = [
      entry({ msg: 'Notion API request', method: 'GET', path: '/pages/abc', reqId: 'r1' }),
      entry({ msg: 'Notion API rate limited, retrying', method: 'GET', path: '/pages/abc', reqId: 'r1' }),
      entry({ msg: 'Notion API request', method: 'GET', path: '/pages/abc', reqId: 'r1' }),
      entry({ level: 50, msg: 'Notion API error', method: 'GET', path: '/pages/abc', reqId: 'r1' }),
    ];

    const rows = groupPairedEntries(entries);
    const notionRows = rows.filter((r): r is NotionCallRow => r.kind === 'notion-call');
    expect(notionRows).toHaveLength(1);
    expect(notionRows[0]!.attempts).toBe(2);
    expect(notionRows[0]!.error).toBeDefined();
    expect(notionRows[0]!.response).toBeUndefined();
  });

  it('does not cross-pair two different reqIds that happen to call the same method+path', () => {
    const entries = [
      entry({ msg: 'Notion API request', method: 'GET', path: '/pages/abc', reqId: 'r1' }),
      entry({ msg: 'Notion API request', method: 'GET', path: '/pages/abc', reqId: 'r2' }),
      entry({ msg: 'Notion API response', method: 'GET', path: '/pages/abc', reqId: 'r2' }),
      entry({ msg: 'Notion API response', method: 'GET', path: '/pages/abc', reqId: 'r1' }),
    ];

    const rows = groupPairedEntries(entries);
    const notionRows = rows.filter((r): r is NotionCallRow => r.kind === 'notion-call');
    expect(notionRows).toHaveLength(2);
    for (const row of notionRows) {
      expect(row.request.reqId).toBe(row.response?.reqId);
    }
  });

  it('pairs a successful LINE reply', () => {
    const entries = [
      entry({ msg: 'LINE reply', method: 'POST', path: '/v2/bot/message/reply', sendId: 's1', reqId: 'r1' }),
      entry({ level: 20, msg: 'LINE reply payload', sendId: 's1', messages: ['ok'], reqId: 'r1' }),
      entry({ msg: 'LINE reply sent', sendId: 's1', reqId: 'r1' }),
    ];

    const rows = groupPairedEntries(entries);
    expect(rows).toHaveLength(1);
    const row = rows[0] as LineSendRow;
    expect(row.kind).toBe('line-reply');
    expect(row.payload).toBeDefined();
    expect(row.sent).toBeDefined();
    expect(row.failure).toBeUndefined();
  });

  it('pairs a failed LINE reply (warn, no "sent" line)', () => {
    const entries = [
      entry({ msg: 'LINE reply', method: 'POST', path: '/v2/bot/message/reply', sendId: 's1', reqId: 'r1' }),
      entry({ level: 20, msg: 'LINE reply payload', sendId: 's1', messages: ['ok'], reqId: 'r1' }),
      entry({ level: 40, msg: 'Reply failed, no fallback available (no groupId for push)', sendId: 's1', reqId: 'r1' }),
    ];

    const rows = groupPairedEntries(entries);
    expect(rows).toHaveLength(1);
    const row = rows[0] as LineSendRow;
    expect(row.kind).toBe('line-reply');
    expect(row.failure).toBeDefined();
    expect(row.sent).toBeUndefined();
  });

  it('pairs LINE push by sendId, not content, without cross-matching two pushes with identical to/messages', () => {
    const entries = [
      entry({ msg: 'LINE push', method: 'POST', path: '/v2/bot/message/push', sendId: 's1' }),
      entry({ msg: 'LINE push', method: 'POST', path: '/v2/bot/message/push', sendId: 's2' }),
      entry({ level: 20, msg: 'LINE push payload', sendId: 's2', to: 'group-1', messages: ['a'] }),
      entry({ level: 20, msg: 'LINE push sent', sendId: 's2' }),
      entry({ level: 20, msg: 'LINE push payload', sendId: 's1', to: 'group-1', messages: ['a'] }),
      entry({ level: 50, msg: 'Push message failed', sendId: 's1' }),
    ];

    const rows = groupPairedEntries(entries);
    const pushRows = rows.filter((r): r is LineSendRow => r.kind === 'line-push');
    expect(pushRows).toHaveLength(2);

    const row1 = pushRows.find((r) => r.start['sendId'] === 's1')!;
    const row2 = pushRows.find((r) => r.start['sendId'] === 's2')!;
    expect(row1.failure).toBeDefined();
    expect(row1.sent).toBeUndefined();
    expect(row2.sent).toBeDefined();
    expect(row2.failure).toBeUndefined();
  });

  it('pairs a "Push message failed payload" debug line to the failurePayload of the already-resolved failed row', () => {
    const entries = [
      entry({ msg: 'LINE push', method: 'POST', path: '/v2/bot/message/push', sendId: 's1' }),
      entry({ level: 20, msg: 'LINE push payload', sendId: 's1', to: 'group-1', messages: ['a'] }),
      entry({ level: 50, msg: 'Push message failed', sendId: 's1' }),
      entry({ level: 20, msg: 'Push message failed payload', sendId: 's1', to: 'group-1', messages: ['a'] }),
    ];

    const rows = groupPairedEntries(entries);
    const pushRows = rows.filter((r): r is LineSendRow => r.kind === 'line-push');
    expect(pushRows).toHaveLength(1);
    expect(pushRows[0]!.failurePayload).toBeDefined();
    expect(pushRows[0]!.failurePayload?.['messages']).toEqual(['a']);
  });

  it('pairs a "Reply failed payload" debug line to the failurePayload of the already-resolved failed row', () => {
    const entries = [
      entry({ msg: 'LINE reply', method: 'POST', path: '/v2/bot/message/reply', sendId: 's1', reqId: 'r1' }),
      entry({ level: 20, msg: 'LINE reply payload', sendId: 's1', messages: ['ok'], reqId: 'r1' }),
      entry({ level: 40, msg: 'Reply failed, no fallback available (no groupId for push)', sendId: 's1', reqId: 'r1' }),
      entry({ level: 20, msg: 'Reply failed payload', sendId: 's1', messages: ['ok'], reqId: 'r1' }),
    ];

    const rows = groupPairedEntries(entries);
    const replyRows = rows.filter((r): r is LineSendRow => r.kind === 'line-reply');
    expect(replyRows).toHaveLength(1);
    expect(replyRows[0]!.failurePayload).toBeDefined();
    expect(replyRows[0]!.failurePayload?.['messages']).toEqual(['ok']);
  });

  it('passes through unmatched entries as kind: single instead of dropping them', () => {
    const entries = [
      entry({ msg: 'hello world', reqId: 'r1' }),
      entry({ msg: 'Notion API response', method: 'GET', path: '/pages/never-requested', reqId: 'r1' }),
      entry({ msg: 'LINE reply sent', reqId: 'r1' }),
    ];

    const rows = groupPairedEntries(entries);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.kind === 'single')).toBe(true);
  });

  it('returns rows sorted ascending by representative time regardless of input order', () => {
    const a = entry({ msg: 'hello a', reqId: 'r1' });
    const b = entry({ msg: 'hello b', reqId: 'r1' });
    const rows = groupPairedEntries([b, a]);
    expect(rows.map((r) => (r.kind === 'single' ? r.entry.msg : ''))).toEqual(['hello a', 'hello b']);
  });
});

describe('buildFlowGroups', () => {
  it('splits two different reqIds into two independent FlowGroups, newest firstTime first', () => {
    const entries = [
      entry({ msg: 'hello a', reqId: 'r1' }), // earlier time
      entry({ msg: 'hello b', reqId: 'r2' }), // later time
    ];
    const rows = groupPairedEntries(entries);
    const groups = buildFlowGroups(rows);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.reqId).toBe('r2');
    expect(groups[1]!.reqId).toBe('r1');
  });

  it('splits a Processing event / Processing event detail pair into start/startDetail, not misc', () => {
    const entries = [
      entry({ msg: 'Processing event', type: 'message', sourceType: 'group', reqId: 'r1' }),
      entry({ level: 20, msg: 'Processing event detail', source: { type: 'group' }, message: { type: 'text', text: 'hi' }, reqId: 'r1' }),
    ];
    const rows = groupPairedEntries(entries);
    const [group] = buildFlowGroups(rows);
    expect(group!.start?.msg).toBe('Processing event');
    expect(group!.startDetail?.msg).toBe('Processing event detail');
    expect(group!.misc).toHaveLength(0);
  });

  it('puts a notion-call row into steps and a line-reply row into end', () => {
    const entries = [
      entry({ msg: 'Notion API request', method: 'GET', path: '/pages/abc', reqId: 'r1' }),
      entry({ msg: 'Notion API response', method: 'GET', path: '/pages/abc', reqId: 'r1' }),
      entry({ msg: 'LINE reply', method: 'POST', path: '/v2/bot/message/reply', sendId: 's1', reqId: 'r1' }),
      entry({ msg: 'LINE reply sent', sendId: 's1', reqId: 'r1' }),
    ];
    const rows = groupPairedEntries(entries);
    const [group] = buildFlowGroups(rows);
    expect(group!.steps).toHaveLength(1);
    expect(group!.steps[0]!.kind).toBe('notion-call');
    expect(group!.end?.kind).toBe('line-reply');
  });

  it('keeps an unmatched single row (e.g. handleMessage) in misc, preserving original ascending time order', () => {
    const entries = [
      entry({ msg: 'Notion API request', method: 'GET', path: '/pages/abc', reqId: 'r1' }),
      entry({ msg: 'handleMessage', userId: 'u1', text: '@Dobby +1', reqId: 'r1' }),
      entry({ msg: 'Notion API response', method: 'GET', path: '/pages/abc', reqId: 'r1' }),
      entry({ msg: 'another misc line', reqId: 'r1' }),
    ];
    const rows = groupPairedEntries(entries);
    const [group] = buildFlowGroups(rows);
    expect(group!.misc).toHaveLength(2);
    expect(group!.misc.map((r) => (r.kind === 'single' ? r.entry.msg : ''))).toEqual(['handleMessage', 'another misc line']);
  });

  it('puts a reqId-less line-push into misc, never into end (only line-reply counts as a flow-table end)', () => {
    const entries = [
      entry({ msg: 'LINE push', method: 'POST', path: '/v2/bot/message/push', sendId: 's1' }),
      entry({ msg: 'LINE push sent', sendId: 's1' }),
    ];
    const rows = groupPairedEntries(entries);
    const [group] = buildFlowGroups(rows);
    expect(group!.reqId).toBe('');
    expect(group!.end).toBeUndefined();
    expect(group!.misc).toHaveLength(1);
    expect(group!.misc[0]!.kind).toBe('line-push');
  });
});
