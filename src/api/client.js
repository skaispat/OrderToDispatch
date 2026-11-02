import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Helper to bypass PostgREST's default 1,000-row limit by paginating in chunks with range(from, to).
 * If total rows > 1000, fetches remaining chunks in parallel for maximum speed.
 */
export async function fetchAllRows(queryBuilderFn, options = {}) {
  const step = options.step || 1000;
  // 1. Fetch first chunk with exact count
  const { data: firstChunk, count, error } = await queryBuilderFn().range(0, step - 1);
  if (error) throw error;

  let all = [...(firstChunk || [])];

  // If total count is known and greater than first chunk, fetch remaining in parallel
  if (count && count > step) {
    const batches = [];
    for (let from = step; from < count; from += step) {
      batches.push(queryBuilderFn().range(from, from + step - 1));
    }
    const results = await Promise.all(batches);
    for (const res of results) {
      if (res.error) throw res.error;
      if (res.data) all.push(...res.data);
    }
  } else if (!count && firstChunk && firstChunk.length === step) {
    // Fallback if count was not returned: sequential fetch until exhausted
    let from = step;
    while (true) {
      const { data, error: nextErr } = await queryBuilderFn().range(from, from + step - 1);
      if (nextErr) throw nextErr;
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < step) break;
      from += step;
    }
  }

  return all;
}
