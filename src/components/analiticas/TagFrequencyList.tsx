import type { TagCount } from "@/lib/analiticas/tagMining";

export function TagFrequencyList({ tags, emptyLabel }: { tags: TagCount[]; emptyLabel?: string }) {
  if (!tags.length) {
    return <p className="text-sm text-muted-foreground text-center py-8">{emptyLabel ?? "Sin tags."}</p>;
  }
  const max = tags[0]?.count || 1;
  return (
    <div className="space-y-2">
      {tags.map(({ tag, count }) => (
        <div key={tag} className="flex items-center justify-between gap-2">
          <span className="text-sm text-foreground truncate">{tag}</span>
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-20 h-2 bg-muted rounded-full">
              <div className="h-full bg-primary rounded-full" style={{ width: `${(count / max) * 100}%` }} />
            </div>
            <span className="text-xs text-muted-foreground w-6 text-right">{count}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
