import { Link } from "wouter";
import { History as HistoryIcon, Trash2, RotateCcw } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { useZefron } from "@/lib/store";
import { formatDuration } from "@/lib/api";

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ms).toLocaleDateString();
}

export function HistoryPage() {
  const history = useZefron((s) => s.history);
  const clearHistory = useZefron((s) => s.clearHistory);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          History
        </h1>
        {history.length > 0 && (
          confirming ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Clear all?</span>
              <button
                type="button"
                onClick={() => { clearHistory(); setConfirming(false); }}
                className="rounded-full bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
              >
                Yes, clear
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Clear
            </button>
          )
        )}
      </div>

      {history.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center text-muted-foreground">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <HistoryIcon className="h-7 w-7 opacity-40" />
          </div>
          <div>
            <p className="font-medium text-foreground">No watch history yet</p>
            <p className="mt-1 text-sm">Videos you watch will appear here.</p>
          </div>
          <Link href="/" className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            Start watching
          </Link>
        </div>
      )}

      {history.length > 0 && (
        <div className="space-y-2">
          {history.map((item, i) => (
            <motion.div
              key={`${item.id}-${item.watchedAt}`}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.02 }}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5 sm:gap-4 sm:p-3"
            >
              <Link href={`/watch?v=${encodeURIComponent(item.id)}`} className="relative h-16 w-28 shrink-0 overflow-hidden rounded-xl bg-muted sm:h-20 sm:w-36">
                <img src={item.thumbnail} alt={item.title} loading="lazy" className="h-full w-full object-cover" />
                <div className="absolute bottom-1 right-1 rounded bg-black/75 px-1 py-0.5 text-[10px] font-medium tabular-nums text-white">
                  {formatDuration(item.durationSeconds)}
                </div>
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={`/watch?v=${encodeURIComponent(item.id)}`} className="group">
                  <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground group-hover:text-primary sm:text-base">
                    {item.title}
                  </p>
                </Link>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.channelName}</p>
                <p className="mt-1 text-[11px] text-muted-foreground/70">{timeAgo(item.watchedAt)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Trash2 className="h-4 w-4 text-muted-foreground/40" />
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
