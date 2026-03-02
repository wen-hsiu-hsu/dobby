import type {
  PageObjectResponse,
  RichTextItemResponse,
} from '@notionhq/client/build/src/api-endpoints.js';

type Properties = PageObjectResponse['properties'];

// Read helpers
export function getRichText(properties: Properties, key: string): string {
  const prop = properties[key];
  if (!prop || prop.type !== 'rich_text') return '';
  return prop.rich_text.map((r: RichTextItemResponse) => r.plain_text).join('');
}

export function getTitle(properties: Properties, key: string): string {
  const prop = properties[key];
  if (!prop || prop.type !== 'title') return '';
  return prop.title.map((r: RichTextItemResponse) => r.plain_text).join('');
}

export function getMultiSelect(properties: Properties, key: string): string[] {
  const prop = properties[key];
  if (!prop || prop.type !== 'multi_select') return [];
  return prop.multi_select.map((s) => s.name);
}

export function getRelation(properties: Properties, key: string): string[] {
  const prop = properties[key];
  if (!prop || prop.type !== 'relation') return [];
  return prop.relation.map((r) => r.id);
}

export function getNumber(properties: Properties, key: string): number | null {
  const prop = properties[key];
  if (!prop || prop.type !== 'number') return null;
  return prop.number;
}

export function getCheckbox(properties: Properties, key: string): boolean {
  const prop = properties[key];
  if (!prop || prop.type !== 'checkbox') return false;
  return prop.checkbox;
}

export function getFormulaBoolean(properties: Properties, key: string): boolean {
  const prop = properties[key];
  if (!prop || prop.type !== 'formula') return false;
  if (prop.formula.type !== 'boolean') return false;
  return prop.formula.boolean ?? false;
}

export function getDate(properties: Properties, key: string): string | null {
  const prop = properties[key];
  if (!prop || prop.type !== 'date') return null;
  return prop.date?.start ?? null;
}

export function getSelect(properties: Properties, key: string): string | null {
  const prop = properties[key];
  if (!prop || prop.type !== 'select') return null;
  return prop.select?.name ?? null;
}

// Write helpers
export function setRichText(content: string) {
  return { rich_text: [{ text: { content } }] };
}

export function setTitle(content: string) {
  return { title: [{ text: { content } }] };
}

export function setMultiSelect(names: string[]) {
  return { multi_select: names.map((name) => ({ name })) };
}

export function setRelation(pageIds: string[]) {
  return { relation: pageIds.map((id) => ({ id })) };
}

export function setNumber(value: number) {
  return { number: value };
}

export function setCheckbox(value: boolean) {
  return { checkbox: value };
}
