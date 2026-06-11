import { Link } from "wouter";
import { Heart, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { useZefron } from "@/lib/store";
import { formatDuration } from "@/lib/api";
import { cn } from "@/lib/utils";

export function LikedPage() {
  const liked = useZefron((s) => s.liked);
  const toggleLike = useZefron((s) => s.toggleLike);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Liked
        </h1>
        <span className="text-sm text-muted-foreground">{liked.length} video{liked.length !== 1 ? "s" : ""}</span>
      </div>

      {liked.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center text-muted-foreground">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Heart className="h-7 w-7 opacity-40" />
          </div>
          <div>
            <p className="font-medium text-foreground">No liked videos yet</p>
            <p className="mt-1 text-sm">Like videos while watching to save them here.</p>
          </div>
          <Link href="/" className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            Browse videos
          </Link>
        </div>
      )}

      {liked.length > 0 && (
        <div className="space-y-2">
          {liked.map((item, i) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
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
              </div>
              <button
                type="button"
                aria-label="Unlike"
                onClick={() => toggleLike(item)}
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border transition-colors hover:bg-destructive/10 hover:text-destructive",
                )}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
