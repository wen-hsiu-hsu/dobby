import { Client } from '@notionhq/client';
import { env } from '../../config/env.js';

export const notion = new Client({ auth: env.NOTION_API_KEY });
