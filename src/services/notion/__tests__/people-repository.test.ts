import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notionPost } from '../notion-fetch.js';
import { create } from '../people-repository.js';

vi.mock('../notion-fetch.js');

const notionPostMock = vi.mocked(notionPost);

describe('people-repository', () => {
  beforeEach(() => {
    notionPostMock.mockReset();
  });

  describe('create', () => {
    it('creates a page with only the Name title in the people database and maps the response', async () => {
      notionPostMock.mockResolvedValue({
        id: 'person-page-1',
        properties: {
          Name: { type: 'title', title: [{ plain_text: 'Alice' }] },
          結清: { type: 'formula', formula: { type: 'boolean', boolean: true } },
        },
      });

      const person = await create('Alice');

      expect(notionPostMock).toHaveBeenCalledWith('/pages', {
        parent: { database_id: process.env['NOTION_DB_PEOPLE'] },
        properties: { Name: { title: [{ text: { content: 'Alice' } }] } },
      });
      expect(person).toEqual({ pageId: 'person-page-1', name: 'Alice', hasPaid: true });
    });
  });
});
