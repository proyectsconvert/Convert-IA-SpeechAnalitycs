export interface TagCount {
  tag: string;
  count: number;
}

export function topTagsFromRows(rows: { tags: string[] }[], limit = 8): TagCount[] {
  const acc: Record<string, number> = {};
  for (const row of rows) {
    for (const t of row.tags || []) {
      const k = String(t).trim();
      if (!k) continue;
      acc[k] = (acc[k] || 0) + 1;
    }
  }
  return Object.entries(acc)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export interface BucketTagSummary {
  bucketId: string;
  bucketLabel: string;
  sampleSize: number;
  topTags: TagCount[];
}

export function topTagsPerBucket<T extends { tags: string[] }>(
  rows: T[],
  bucketOf: (row: T) => string | null,
  bucketMeta: { id: string; label: string }[],
  topN = 5,
): BucketTagSummary[] {
  const byBucket = new Map<string, T[]>();
  for (const row of rows) {
    const bid = bucketOf(row);
    if (!bid) continue;
    const arr = byBucket.get(bid) || [];
    arr.push(row);
    byBucket.set(bid, arr);
  }
  return bucketMeta.map(({ id, label }) => {
    const subset = byBucket.get(id) || [];
    return {
      bucketId: id,
      bucketLabel: label,
      sampleSize: subset.length,
      topTags: topTagsFromRows(subset, topN),
    };
  });
}
