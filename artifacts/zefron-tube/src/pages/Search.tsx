import { useEffect, useState, useRef } from "react";
import { useSearch } from "wouter";
import { Loader2, SearchX } from "lucide-react";
import { searchVideos, isBroken, type Video } from "@/lib/api";
import { VideoCard } from "@/components/VideoCard";

export function SearchPage() {
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const query = params.get("q") || "";

  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevQuery = useRef("");

  useEffect(() => {
    if (!query || query === prevQuery.current) return;
    prevQuery.current = query;
    setLoading(true);
    setError(null);
    setVideos([]);
    const ctl = new AbortController();
    searchVideos(query, 18, ctl.signal)
      .then((v) => { setVideos(v); setLoading(false); })
      .catch((e) => {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message || "Search failed");
        setLoading(false);
      });
    return () => ctl.abort();
  }, [query]);

  const visible = videos.filter((v) => !isBroken(v.id));

  return (
    <div className="space-y-6">
      <div className="px-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {query ? (
            <>
              Results for{" "}
              <span className="text-primary">&ldquo;{query}&rdquo;</span>
            </>
          ) : (
            "Search"
          )}
        </h1>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <Loader2 className="h-7 w-7 animate-spin" />
          <p className="text-sm">Searching…</p>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && visible.length === 0 && query && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <SearchX className="h-10 w-10 opacity-40" />
          <p className="text-sm">No results found for &ldquo;{query}&rdquo;</p>
        </div>
      )}

      {visible.length > 0 && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:gap-x-4 sm:gap-y-6 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((v, i) => (
            <VideoCard key={v.id} video={v} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
