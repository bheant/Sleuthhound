// One hit from the Algolia Hacker News search API (search_by_date). Stories
// carry a title; comments carry comment_text and their story's title.
export type HnHit = {
  objectID: string;
  created_at: string;
  created_at_i: number;
  author: string;
  title?: string | null;
  url?: string | null;
  story_text?: string | null;
  comment_text?: string | null;
  story_title?: string | null;
  story_id?: number | null;
  points?: number | null;
  num_comments?: number | null;
  _tags?: string[];
};

export type HnSearchResult = { hits: HnHit[]; nbHits: number };
