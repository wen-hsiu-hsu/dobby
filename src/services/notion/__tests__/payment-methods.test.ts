import { describe, it, expect } from 'vitest';
import { parsePaymentTable, paymentMethodsToText, tablesToText, paymentExtraText, paymentPageToText } from '../payment-methods.js';
import type { NestedBlock } from '../blocks-to-text.js';

function row(...cells: string[]) {
  return { type: 'table_row', table_row: { cells: cells.map((c) => (c ? [{ plain_text: c }] : [])) } };
}

function table(rows: unknown[], hasColumnHeader = true) {
  return { type: 'table', table: { table_width: 3, has_column_header: hasColumnHeader }, children: rows };
}

function paragraph(text: string) {
  return { type: 'paragraph', paragraph: { rich_text: [{ plain_text: text }] } };
}

// 2026-10-01 Notion PAYMENT_V2 的實際內容
const realTable = table([
  row('名稱', '帳號', '備註'),
  row('永豐銀行 （807）', '20201800934932', '請備註名字'),
  row('Line Pay Money', '', ''),
  row('現金', '', ''),
]);

describe('parsePaymentTable', () => {
  it('reads each data row by header name, leaving empty cells as empty strings', () => {
    expect(parsePaymentTable([realTable] as unknown as NestedBlock[])).toEqual([
      { name: '永豐銀行 （807）', account: '20201800934932', note: '請備註名字' },
      { name: 'Line Pay Money', account: '', note: '' },
      { name: '現金', account: '', note: '' },
    ]);
  });

  it('maps columns by header text, not position', () => {
    const blocks = [table([row('備註', '帳號', '名稱'), row('請備註名字', '123', '永豐')])];
    expect(parsePaymentTable(blocks as unknown as NestedBlock[])).toEqual([
      { name: '永豐', account: '123', note: '請備註名字' },
    ]);
  });

  it('trims cells and joins multi-part rich text', () => {
    const blocks = [
      table([
        row('名稱', '帳號'),
        { type: 'table_row', table_row: { cells: [[{ plain_text: ' 永豐 ' }, { plain_text: '(807)' }], [{ plain_text: ' 123 ' }]] } },
      ]),
    ];
    expect(parsePaymentTable(blocks as unknown as NestedBlock[])).toEqual([{ name: '永豐 (807)', account: '123', note: '' }]);
  });

  it('works without 帳號／備註 columns', () => {
    const blocks = [table([row('名稱'), row('現金')])];
    expect(parsePaymentTable(blocks as unknown as NestedBlock[])).toEqual([{ name: '現金', account: '', note: '' }]);
  });

  it('skips rows with neither a name nor an account, keeps an account-only row', () => {
    const blocks = [table([row('名稱', '帳號', '備註'), row('', '', '只有備註'), row('', '999', '')])];
    expect(parsePaymentTable(blocks as unknown as NestedBlock[])).toEqual([{ name: '', account: '999', note: '' }]);
  });

  it('uses the first table with a header row and ignores other blocks', () => {
    const blocks = [paragraph('說明'), table([row('名稱'), row('舊的')], false), table([row('名稱'), row('現金')])];
    expect(parsePaymentTable(blocks as unknown as NestedBlock[])).toEqual([{ name: '現金', account: '', note: '' }]);
  });

  it('returns null when there is no table', () => {
    expect(parsePaymentTable([paragraph('永豐 (807) 123')] as unknown as NestedBlock[])).toBeNull();
  });

  it('returns null when the table has no header row turned on', () => {
    expect(parsePaymentTable([table(realTable.children, false)] as unknown as NestedBlock[])).toBeNull();
  });

  it('returns null when the header has no 名稱 column', () => {
    expect(parsePaymentTable([table([row('方式', '帳號'), row('永豐', '123')])] as unknown as NestedBlock[])).toBeNull();
  });

  it('returns null when there are no data rows', () => {
    expect(parsePaymentTable([table([row('名稱', '帳號')])] as unknown as NestedBlock[])).toBeNull();
    expect(parsePaymentTable([table([row('名稱', '帳號'), row('', '')])] as unknown as NestedBlock[])).toBeNull();
  });
});

describe('paymentMethodsToText', () => {
  it('puts one method per line as "name account (note)", skipping empty parts', () => {
    expect(
      paymentMethodsToText([
        { name: '永豐銀行 （807）', account: '20201800934932', note: '請備註名字' },
        { name: 'Line Pay Money', account: '', note: '' },
        { name: '現金', account: '', note: '當天交給管理員' },
        { name: '', account: '999', note: '' },
      ]),
    ).toBe('永豐銀行 （807） 20201800934932 (請備註名字)\nLine Pay Money\n現金 (當天交給管理員)\n999');
  });
});

describe('tablesToText', () => {
  it('skips the header row when it is turned on and joins non-empty cells with spaces', () => {
    expect(tablesToText([realTable] as unknown as NestedBlock[])).toBe(
      '永豐銀行 （807） 20201800934932 請備註名字\nLine Pay Money\n現金',
    );
  });

  it('keeps the first row when the header row is turned off', () => {
    expect(tablesToText([table([row('永豐', '123'), row('現金')], false)] as unknown as NestedBlock[])).toBe('永豐 123\n現金');
  });

  it('covers every table, skips empty rows and non-table blocks', () => {
    const blocks = [paragraph('說明'), table([row('a'), row('', '')], false), table([row('名稱'), row('b')])];
    expect(tablesToText(blocks as unknown as NestedBlock[])).toBe('a\nb');
  });

  it('returns an empty string when there is no table', () => {
    expect(tablesToText([paragraph('說明')] as unknown as NestedBlock[])).toBe('');
  });
});

describe('paymentExtraText', () => {
  it('returns the text outside tables, and nothing for whitespace-only text', () => {
    expect(paymentExtraText([paragraph('說明'), realTable] as unknown as NestedBlock[])).toBe('說明');
    expect(paymentExtraText([paragraph('   '), realTable] as unknown as NestedBlock[])).toBe('');
  });
});

describe('paymentPageToText', () => {
  it('lists the parsed methods, then the text outside the table', () => {
    expect(paymentPageToText([realTable, paragraph('轉帳後請私訊管理員')] as unknown as NestedBlock[])).toBe(
      '永豐銀行 （807） 20201800934932 (請備註名字)\nLine Pay Money\n現金\n轉帳後請私訊管理員',
    );
  });

  it('falls back to the raw table rows when the table cannot be parsed', () => {
    const blocks = [table([row('銀行', '帳號'), row('永豐', '123')])];
    expect(paymentPageToText(blocks as unknown as NestedBlock[])).toBe('永豐 123');
  });

  it('returns an empty string for an empty page', () => {
    expect(paymentPageToText([])).toBe('');
  });
});
