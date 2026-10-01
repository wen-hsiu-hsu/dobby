import type { NestedBlock } from './blocks-to-text.js';

/**
 * Notion「所有公告」PAYMENT_V2 頁面裡付款表格的一列。
 * 表格要開「標題列」，欄位依標題文字對應（不看欄位順序）：
 * `名稱`（必填欄位）、`帳號`、`備註`，後兩欄可以整欄不存在，格子沒填就是空字串。
 */
export interface PaymentMethod {
  name: string;
  account: string;
  note: string;
}

const COLUMN_NAME = '名稱';
const COLUMN_ACCOUNT = '帳號';
const COLUMN_NOTE = '備註';

function cellText(cell: any[] | undefined): string {
  return (cell ?? []).map((r: any) => r.plain_text ?? '').join('').trim();
}

/**
 * 從頁面區塊找出第一個有標題列的表格，轉成付款方式清單。
 * 沒有表格、表格沒開標題列、標題列沒有「名稱」欄、或沒有任何一列有內容時回傳 null，
 * 呼叫端要改走純文字（管理員把表格改掉時，付款資訊還是要回得出來）。
 * 名稱、帳號都空白的列（例如表格底下多留的空列）會略過。
 */
export function parsePaymentTable(blocks: NestedBlock[]): PaymentMethod[] | null {
  const table = blocks.find((b) => b.type === 'table' && (b as any).table?.has_column_header);
  const rows = (table?.children ?? []).filter((b) => b.type === 'table_row');
  if (rows.length === 0) return null;

  const cellsOf = (row: NestedBlock): any[][] => (row as any).table_row?.cells ?? [];
  const header = cellsOf(rows[0]!).map(cellText);
  const nameCol = header.indexOf(COLUMN_NAME);
  if (nameCol === -1) return null;
  const accountCol = header.indexOf(COLUMN_ACCOUNT);
  const noteCol = header.indexOf(COLUMN_NOTE);

  const methods = rows.slice(1).flatMap((row) => {
    const cells = cellsOf(row);
    const name = cellText(cells[nameCol]);
    const account = accountCol === -1 ? '' : cellText(cells[accountCol]);
    const note = noteCol === -1 ? '' : cellText(cells[noteCol]);
    return name || account ? [{ name, account, note }] : [];
  });
  return methods.length > 0 ? methods : null;
}

/**
 * `parsePaymentTable()` 讀不到時的退路：頁面上每個表格的每一列，非空的儲存格用空白串起來、
 * 一列一行。表格有開標題列時略過標題列。管理員關掉標題列或改了欄名時，帳號還是回得出來
 * （`blocksToText()` 不輸出表格，不靠這個的話整頁只剩表格時會回「付款資訊為空」）。
 */
export function tablesToText(blocks: NestedBlock[]): string {
  return blocks
    .filter((b) => b.type === 'table')
    .flatMap((table) => {
      const rows = (table.children ?? []).filter((b) => b.type === 'table_row');
      const dataRows = (table as any).table?.has_column_header ? rows.slice(1) : rows;
      return dataRows.map((row) =>
        ((row as any).table_row?.cells ?? []).map(cellText).filter(Boolean).join(' '),
      );
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * 付款方式的純文字版，一種方式一行，例如「永豐銀行 （807） 20201800934932 (請備註名字)」。
 * 付款卡的 altText 用這段。
 */
export function paymentMethodsToText(methods: PaymentMethod[]): string {
  return methods
    .map((m) => {
      const main = [m.name, m.account].filter(Boolean).join(' ');
      return m.note ? `${main} (${m.note})` : main;
    })
    .join('\n');
}
