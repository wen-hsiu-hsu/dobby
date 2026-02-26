import { describe, it, expect } from 'vitest';
import {
  getRichText,
  getTitle,
  getMultiSelect,
  getRelation,
  getNumber,
  getCheckbox,
  getDate,
  getSelect,
  setRichText,
  setTitle,
  setMultiSelect,
  setRelation,
  setNumber,
  setCheckbox,
} from '../property-helpers.js';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints.js';

type Properties = PageObjectResponse['properties'];

describe('property-helpers read', () => {
  it('getRichText returns plain text', () => {
    const props: Properties = {
      Foo: { id: '1', type: 'rich_text', rich_text: [{ plain_text: 'hello', type: 'text', text: { content: 'hello', link: null }, annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' }, href: null }] },
    };
    expect(getRichText(props, 'Foo')).toBe('hello');
  });

  it('getRichText returns empty string for missing key', () => {
    expect(getRichText({} as Properties, 'Missing')).toBe('');
  });

  it('getTitle returns plain text', () => {
    const props: Properties = {
      Name: { id: '1', type: 'title', title: [{ plain_text: 'Alice', type: 'text', text: { content: 'Alice', link: null }, annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' }, href: null }] },
    };
    expect(getTitle(props, 'Name')).toBe('Alice');
  });

  it('getMultiSelect returns array of names', () => {
    const props: Properties = {
      Tags: { id: '1', type: 'multi_select', multi_select: [{ id: 'a', name: 'foo', color: 'default' }, { id: 'b', name: 'bar', color: 'blue' }] },
    };
    expect(getMultiSelect(props, 'Tags')).toEqual(['foo', 'bar']);
  });

  it('getMultiSelect returns empty array for missing key', () => {
    expect(getMultiSelect({} as Properties, 'Tags')).toEqual([]);
  });

  it('getRelation returns array of ids', () => {
    const props: Properties = {
      Rel: { id: '1', type: 'relation', relation: [{ id: 'abc' }, { id: 'def' }] },
    };
    expect(getRelation(props, 'Rel')).toEqual(['abc', 'def']);
  });

  it('getNumber returns number', () => {
    const props: Properties = {
      Count: { id: '1', type: 'number', number: 42 },
    };
    expect(getNumber(props, 'Count')).toBe(42);
  });

  it('getNumber returns null for null value', () => {
    const props: Properties = {
      Count: { id: '1', type: 'number', number: null },
    };
    expect(getNumber(props, 'Count')).toBeNull();
  });

  it('getCheckbox returns boolean', () => {
    const props: Properties = {
      Done: { id: '1', type: 'checkbox', checkbox: true },
    };
    expect(getCheckbox(props, 'Done')).toBe(true);
  });

  it('getDate returns start date string', () => {
    const props: Properties = {
      At: { id: '1', type: 'date', date: { start: '2024-01-01', end: null, time_zone: null } },
    };
    expect(getDate(props, 'At')).toBe('2024-01-01');
  });

  it('getDate returns null for null date', () => {
    const props: Properties = {
      At: { id: '1', type: 'date', date: null },
    };
    expect(getDate(props, 'At')).toBeNull();
  });

  it('getSelect returns select name', () => {
    const props: Properties = {
      Status: { id: '1', type: 'select', select: { id: 'x', name: 'Active', color: 'green' } },
    };
    expect(getSelect(props, 'Status')).toBe('Active');
  });
});

describe('property-helpers write', () => {
  it('setRichText returns correct structure', () => {
    expect(setRichText('hello')).toEqual({ rich_text: [{ text: { content: 'hello' } }] });
  });

  it('setTitle returns correct structure', () => {
    expect(setTitle('Bob')).toEqual({ title: [{ text: { content: 'Bob' } }] });
  });

  it('setMultiSelect returns correct structure', () => {
    expect(setMultiSelect(['a', 'b'])).toEqual({ multi_select: [{ name: 'a' }, { name: 'b' }] });
  });

  it('setRelation returns correct structure', () => {
    expect(setRelation(['id1', 'id2'])).toEqual({ relation: [{ id: 'id1' }, { id: 'id2' }] });
  });

  it('setNumber returns correct structure', () => {
    expect(setNumber(5)).toEqual({ number: 5 });
  });

  it('setCheckbox returns correct structure', () => {
    expect(setCheckbox(true)).toEqual({ checkbox: true });
  });
});
