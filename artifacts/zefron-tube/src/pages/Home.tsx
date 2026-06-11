import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  Sparkles,
  RefreshCw,
  Play,
  Music2,
  Code2,
  Gamepad2,
  Utensils,
  Palmtree,
  Laugh,
  Brain,
  Flame,
  Mic,
  Tv,
  Heart,
  History as HistoryIcon,
} from "lucide-react";
import { Shelf } from "@/components/Shelf";
import { VideoCard, VideoCardSkeleton } from "@/components/VideoCard";
import { CATALOG } from "@/lib/catalog";
import { useZefron } from "@/lib/store";
import { generateBecauseYouWatched, generateTrendingNow } from "@/lib/ai";
import { searchVideos, isBroken, formatDuration, type Video } from "@/lib/api";
import { languageSearchModifiers, languageDisplayName } from "@/lib/locale";
import { cn } from "@/lib/utils";

// Module-level caches survive route transitions for instant back-nav.
let personalizedCache: { signature: string; keywords: string[]; videos: Video[] } | null = null;
let trendingCache: { videos: Video[]; ts: number } | null = null;
let likedPicksCache: { signature: string; videos: Video[] } | null = null;
const TRENDING_TTL_MS = 10 * 60 * 1000;

const MOOD_CHIPS: Array<{ label: string; query: string; Icon: typeof Music2 }> = [
  { label: "Lofi", query: "lofi hip hop radio", Icon: Music2 },
  { label: "Tech", query: "best tech reviews 2025", Icon: Code2 },
  { label: "Gaming", query: "top gaming highlights", Icon: Gamepad2 },
  { label: "Cooking", query: "easy recipes", Icon: Utensils },
  { label: "Travel", query: "travel vlog", Icon: Palmtree },
  { label: "Comedy", query: "stand up comedy", Icon: Laugh },
  { label: "Learn", query: "ted talk", Icon: Brain },
  { label: "Trending", query: "trending music videos", Icon: Flame },
  { label: "Podcasts", query: "best podcast clips", Icon: Mic },
  { label: "Documentary", query: "documentary", Icon: Tv },
];

function buildFallbackQueries(items: Array<{ title: string; channelName: string }>) {
  const queries = new Set<string>();
  for (const item of items) {
    const title = item.title.replace(/\s+/g, " ").trim();
    const primary = title.split(/\s[-|–—]\s/)[0]?.trim();
    if (title.length >= 3) queries.add(title);
    if (primary && primary.length >= 3) queries.add(primary);
    if (item.channelName && item.channelName.length >= 3 && !/^unknown/i.test(item.channelName)) {
      queries.add(item.channelName.trim());
      if (primary && primary.length >= 3) queries.add(`${primary} ${item.channelName.trim()}`);
    }
  }
  return Array.from(queries).slice(0, 8);
}

function MoodChips() {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {MOOD_CHIPS.map(({ label, query, Icon }) => (
        <Link
          key={label}
          href={`/search?q=${encodeURIComponent(query)}`}
          className="group inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-medium text-foreground/90 shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
        >
          <Icon className="h-3.5 w-3.5 opacity-70 group-hover:opacity-100" />
          {label}
        </Link>
      ))}
    </div>
  );
}

function ContinueWatching() {
  const history = useZefron((s) => s.history);
  const playVideo = useZefron((s) => s.playVideo);

  const items = useMemo(() => {
    return history
      .filter(
        (h) =>
          h.watchedSeconds > 5 &&
          h.durationSeconds > 0 &&
          h.watchedSeconds < h.durationSeconds * 0.95 &&
          !isBroken(h.id),
      )
      .slice(0, 8);
  }, [history]);

  if (items.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between px-1">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl">
          <Play className="h-4 w-4 fill-primary text-primary" />
          Continue watching
        </h2>
        <p className="hidden text-xs text-muted-foreground sm:block">Pick up where you left off</p>
      </div>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((it, i) => {
          const pct = Math.min(100, Math.max(2, Math.round((it.watchedSeconds / Math.max(1, it.durationSeconds)) * 100)));
          const remaining = Math.max(0, it.durationSeconds - it.watchedSeconds);
          return (
            <motion.button
              key={it.id}
              type="button"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(i, 6) * 0.03 }}
              onClick={() =>
                playVideo({
                  id: it.id,
                  title: it.title,
                  channelName: it.channelName,
                  thumbnail: it.thumbnail,
                  duration: String(it.durationSeconds),
                  durationSeconds: it.durationSeconds,
                  isLive: false,
                  youtubeUrl: it.youtubeUrl,
                })
              }
              className="group relative w-[260px] shrink-0 overflow-hidden rounded-2xl bg-card text-left shadow-soft transition-shadow hover:shadow-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-[300px]"
            >
              <div className="relative aspect-video overflow-hidden bg-muted">
                <img
                  src={it.thumbnail}
                  alt={it.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                  <div className="rounded-full bg-primary/90 p-3 text-primary-foreground shadow-elevated">
                    <Play className="h-5 w-5 fill-current" />
                  </div>
                </div>
                <div className="absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white backdrop-blur-sm">
                  {formatDuration(remaining)} left
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                  <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="p-3">
                <h3 className="line-clamp-2 text-sm font-medium leading-snug text-foreground">{it.title}</h3>
                <p className="mt-1 truncate text-xs text-muted-foreground">{it.channelName}</p>
              </div>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}

function WatchAgain() {
  const history = useZefron((s) => s.history);
  const playVideo = useZefron((s) => s.playVideo);

  const items = useMemo(() => {
    return history
      .filter(
        (h) =>
          h.durationSeconds > 0 &&
          h.watchedSeconds >= h.durationSeconds * 0.9 &&
          !isBroken(h.id),
      )
      .slice(0, 10);
  }, [history]);

  if (items.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between px-1">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl">
          <HistoryIcon className="h-4 w-4 text-primary" />
          Watch again
        </h2>
        <p className="hidden text-xs text-muted-foreground sm:block">Recent finishes</p>
      </div>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((it, i) => (
          <motion.button
            key={it.id}
            type="button"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: Math.min(i, 6) * 0.03 }}
            onClick={() =>
              playVideo({
                id: it.id,
                title: it.title,
                channelName: it.channelName,
                thumbnail: it.thumbnail,
                duration: String(it.durationSeconds),
                durationSeconds: it.durationSeconds,
                isLive: false,
                youtubeUrl: it.youtubeUrl,
              })
            }
            className="group relative w-[220px] shrink-0 overflow-hidden rounded-2xl bg-card text-left shadow-soft transition-shadow hover:shadow-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-[260px]"
          >
            <div className="relative aspect-video overflow-hidden bg-muted">
              <img
                src={it.thumbnail}
                alt={it.title}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                <div className="rounded-full bg-primary/90 p-2.5 text-primary-foreground shadow-elevated">
                  <Play className="h-4 w-4 fill-current" />
                </div>
              </div>
            </div>
            <div className="p-3">
              <h3 className="line-clamp-2 text-sm font-medium leading-snug text-foreground">{it.title}</h3>
              <p className="mt-1 truncate text-xs text-muted-foreground">{it.channelName}</p>
            </div>
          </motion.button>
        ))}
      </div>
    </section>
  );
}

function LikedPicks() {
  const liked = useZefron((s) => s.liked);
  const [videos, setVideos] = useState<Video[] | null>(likedPicksCache?.videos ?? null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (liked.length === 0) { setVideos(null); return; }
    const top = liked.slice(0, 4);
    const signature = top.map((l) => l.id).join("|");
    if (likedPicksCache?.signature === signature) { setVideos(likedPicksCache.videos); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const queries = Array.from(
        new Set(
          top
            .map((l) => l.title.split(/\s[-|–—]\s/)[0]?.trim())
            .filter((q): q is string => !!q && q.length >= 3),
        ),
      ).slice(0, 4);
      const lists = await Promise.all(
        queries.map(async (q) => {
          try { return await searchVideos(q, 4); } catch { return []; }
        }),
      );
      const seen = new Set<string>(top.map((l) => l.id));
      const merged: Video[] = [];
      const maxLen = Math.max(...lists.map((l) => l.length), 0);
      for (let i = 0; i < maxLen; i++) {
        for (const l of lists) {
          const v = l[i];
          if (!v || seen.has(v.id) || isBroken(v.id)) continue;
          seen.add(v.id);
          merged.push(v);
        }
      }
      const final = merged.slice(0, 8);
      likedPicksCache = { signature, videos: final };
      if (!cancelled) { setVideos(final); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [liked]);

  if (liked.length === 0) return null;
  const visible = videos?.filter((v) => !isBroken(v.id)) ?? null;
  if (visible !== null && visible.length === 0 && !loading) return null;

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between px-1">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl">
          <Heart className="h-4 w-4 fill-rose-500 text-rose-500" />
          More like what you loved
        </h2>
        <p className="hidden text-xs text-muted-foreground sm:block">From your liked videos</p>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:gap-x-4 sm:gap-y-6 lg:grid-cols-3 xl:grid-cols-4">
        {visible === null || loading
          ? Array.from({ length: 4 }).map((_, i) => <VideoCardSkeleton key={i} />)
          : visible.map((v, i) => <VideoCard key={v.id} video={v} index={i} />)}
      </div>
    </section>
  );
}

export function HomePage() {
  const history = useZefron((s) => s.history);
  const liked = useZefron((s) => s.liked);
  const languagePref = useZefron((s) => s.languagePref);
  const detectedLocation = useZefron((s) => s.detectedLocation);

  const effectiveLang = languagePref === "auto" ? detectedLocation?.language ?? "global" : languagePref;
  const effectiveRegion = languagePref === "auto" ? detectedLocation?.region || detectedLocation?.countryName || "" : "";

  const [aiVideos, setAiVideos] = useState<Video[] | null>(personalizedCache?.videos ?? null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiKeywords, setAiKeywords] = useState<string[]>(personalizedCache?.keywords ?? []);
  const [aiNonce, setAiNonce] = useState(0);

  const [trending, setTrending] = useState<Video[] | null>(trendingCache?.videos ?? null);
  const [trendingLoading, setTrendingLoading] = useState(false);

  const [regional, setRegional] = useState<Video[] | null>(null);
  const [regionalLoading, setRegionalLoading] = useState(false);

  const [shelfShuffleKey] = useState(() => Date.now());

  useEffect(() => {
    personalizedCache = null;
    trendingCache = null;
    likedPicksCache = null;
    setAiVideos(null);
    setTrending(null);
    setAiNonce((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    personalizedCache = null;
    trendingCache = null;
    setAiVideos(null);
    setTrending(null);
    setAiNonce((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveLang]);

  // Personalized / because-you-watched
  useEffect(() => {
    const hasSignal = history.length > 0 || liked.length > 0;
    if (!hasSignal) { setAiVideos([]); return; }
    const signals = [
      ...liked.slice(0, 4).map((l) => ({ id: l.id, title: l.title, channelName: l.channelName })),
      ...history.slice(0, 6).map((h) => ({ id: h.id, title: h.title, channelName: h.channelName })),
    ].slice(0, 8);
    const signature = signals.map((s) => s.id).join("|") + `::${effectiveLang}`;
    if (personalizedCache?.signature === signature) { setAiVideos(personalizedCache.videos); return; }
    let cancelled = false;
    setAiLoading(true);
    setAiError(null);
    (async () => {
      try {
        const recentTitles = history.slice(0, 6).map((h) => h.title);
        const likedTitles = liked.slice(0, 4).map((l) => l.title);
        const langMods = languageSearchModifiers(effectiveLang);
        const { keywords: aiKw, error: aiErr } = await generateBecauseYouWatched({
          data: { recentTitles, likedTitles, language: effectiveLang, region: effectiveRegion },
        });
        let kw: string[];
        if (aiKw.length > 0) {
          kw = [...aiKw, ...(langMods.length > 0 ? langMods.slice(0, 2) : [])].slice(0, 8);
          if (!cancelled) setAiKeywords(aiKw.slice(0, 3));
        } else {
          kw = buildFallbackQueries(signals).slice(0, 6);
          if (aiErr && !cancelled) setAiError("Using recent watch history as fallback.");
        }
        const lists = await Promise.all(
          kw.slice(0, 6).map(async (q) => { try { return await searchVideos(q, 4); } catch { return []; } }),
        );
        const seen = new Set<string>(signals.map((s) => s.id));
        const merged: Video[] = [];
        const maxLen = Math.max(...lists.map((l) => l.length), 0);
        for (let i = 0; i < maxLen; i++) {
          for (const l of lists) {
            const v = l[i];
            if (!v || seen.has(v.id) || isBroken(v.id)) continue;
            seen.add(v.id);
            merged.push(v);
          }
        }
        const final = merged.slice(0, 12);
        personalizedCache = { signature, keywords: aiKw, videos: final };
        if (!cancelled) { setAiVideos(final); setAiLoading(false); }
      } catch (err) {
        if (!cancelled) { setAiError("Couldn't load personalized picks."); setAiLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [aiNonce]);

  // Trending
  useEffect(() => {
    const now = Date.now();
    if (trendingCache && now - trendingCache.ts < TRENDING_TTL_MS) { setTrending(trendingCache.videos); return; }
    let cancelled = false;
    setTrendingLoading(true);
    (async () => {
      try {
        const hint = history.length > 0 ? history.slice(0, 3).map((h) => h.channelName).join(", ") : undefined;
        const langMods = languageSearchModifiers(effectiveLang);
        const { keywords: kw } = await generateTrendingNow({ data: { hint, language: effectiveLang, region: effectiveRegion } });
        const allKw = [...kw, ...langMods.slice(0, 2)].filter(Boolean).slice(0, 6);
        if (allKw.length === 0) {
          if (!cancelled) { setTrending([]); setTrendingLoading(false); }
          return;
        }
        const lists = await Promise.all(
          allKw.map(async (k) => { try { return await searchVideos(k, 4); } catch { return []; } }),
        );
        const seen = new Set<string>();
        const merged: Video[] = [];
        const maxLen = Math.max(...lists.map((l) => l.length), 0);
        for (let i = 0; i < maxLen; i++) {
          for (const l of lists) {
            const v = l[i];
            if (!v || seen.has(v.id) || isBroken(v.id)) continue;
            seen.add(v.id);
            merged.push(v);
          }
        }
        const final = merged.slice(0, 8).sort(() => Math.random() - 0.5);
        trendingCache = { videos: final, ts: Date.now() };
        if (!cancelled) { setTrending(final); setTrendingLoading(false); }
      } catch {
        if (!cancelled) { setTrending([]); setTrendingLoading(false); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveLang]);

  // Regional shelf
  useEffect(() => {
    if (!effectiveLang || effectiveLang === "global" || effectiveLang === "en") {
      setRegional(null);
      return;
    }
    let cancelled = false;
    setRegionalLoading(true);
    const mods = languageSearchModifiers(effectiveLang);
    if (mods.length === 0) { setRegional(null); setRegionalLoading(false); return; }
    (async () => {
      const lists = await Promise.all(
        mods.slice(0, 3).map(async (q) => { try { return await searchVideos(q, 6); } catch { return []; } }),
      );
      const seen = new Set<string>();
      const merged: Video[] = [];
      const maxLen = Math.max(...lists.map((l) => l.length), 0);
      for (let i = 0; i < maxLen; i++) {
        for (const l of lists) {
          const v = l[i];
          if (!v || seen.has(v.id) || isBroken(v.id)) continue;
          seen.add(v.id);
          merged.push(v);
        }
      }
      if (!cancelled) { setRegional(merged.slice(0, 8)); setRegionalLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [effectiveLang]);

  const hasSignal = history.length > 0 || liked.length > 0;
  const baseTitles = CATALOG.map((s) => s.title);
  const regionalLabel = effectiveLang && effectiveLang !== "global" && effectiveLang !== "en"
    ? `Popular in ${languageDisplayName(effectiveLang)}`
    : null;
  const regionalVisible = regional?.filter((v) => !isBroken(v.id)) ?? null;

  const handleRefreshAi = () => {
    personalizedCache = null;
    setAiVideos(null);
    setAiNonce((n) => n + 1);
  };

  return (
    <div className="space-y-8 sm:space-y-10">
      <div className="px-1">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground xs:text-3xl sm:text-4xl">
          Discover
        </h1>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground sm:text-sm">
          {hasSignal ? (
            <>
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span>Personalized for you based on what you've watched</span>
            </>
          ) : (
            <span>Hand-picked picks across tech, science, food, travel and more.</span>
          )}
        </p>
      </div>

      <MoodChips />
      <ContinueWatching />
      <WatchAgain />

      {regionalLabel && (regionalLoading || (regionalVisible && regionalVisible.length > 0)) && (
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              <Flame className="h-4 w-4 text-rose-500" />
              {regionalLabel}
            </h2>
            <p className="hidden text-xs text-muted-foreground sm:block">Mixed with global picks</p>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:gap-x-4 sm:gap-y-6 lg:grid-cols-3 xl:grid-cols-4">
            {regionalVisible === null || regionalLoading
              ? Array.from({ length: 4 }).map((_, i) => <VideoCardSkeleton key={i} />)
              : regionalVisible.map((v, i) => <VideoCard key={v.id} video={v} index={i} />)}
          </div>
        </section>
      )}

      {hasSignal &&
        (() => {
          const visible = aiVideos?.filter((v) => !isBroken(v.id)) ?? null;
          if (visible !== null && visible.length === 0 && !aiLoading && !aiError) return null;
          return (
            <section>
              <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Recommended for you
                </h2>
                <button
                  type="button"
                  onClick={handleRefreshAi}
                  disabled={aiLoading}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground/80 transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-50"
                >
                  <RefreshCw className={cn(aiLoading && "animate-spin", "h-3 w-3")} />
                  Refresh
                </button>
              </div>
              {aiKeywords.length > 0 && !aiLoading && (
                <p className="mb-3 px-1 text-xs text-muted-foreground">
                  Because you watched:{" "}
                  <span className="text-foreground/80">{aiKeywords.slice(0, 3).join(" • ")}</span>
                </p>
              )}
              {aiError && visible !== null && visible.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">{aiError}</div>
              ) : (
                <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:gap-x-4 sm:gap-y-6 lg:grid-cols-3 xl:grid-cols-4">
                  {visible === null || aiLoading
                    ? Array.from({ length: 8 }).map((_, i) => <VideoCardSkeleton key={i} />)
                    : visible.map((v, i) => <VideoCard key={v.id} video={v} index={i} />)}
                </div>
              )}
            </section>
          );
        })()}

      <LikedPicks />

      {(() => {
        const visible = trending?.filter((v) => !isBroken(v.id)) ?? null;
        if (visible !== null && visible.length === 0 && !trendingLoading) return null;
        return (
          <section>
            <div className="mb-3 flex items-baseline justify-between px-1">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                <Flame className="h-4 w-4 text-orange-500" />
                Trending now
              </h2>
              <p className="hidden text-xs text-muted-foreground sm:block">What people are watching</p>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:gap-x-4 sm:gap-y-6 lg:grid-cols-3 xl:grid-cols-4">
              {visible === null || trendingLoading
                ? Array.from({ length: 4 }).map((_, i) => <VideoCardSkeleton key={i} />)
                : visible.map((v, i) => <VideoCard key={v.id} video={v} index={i} />)}
            </div>
          </section>
        );
      })()}

      <div className="space-y-12">
        {baseTitles.map((title) => (
          <Shelf key={title} title={title} shuffleKey={shelfShuffleKey} />
        ))}
      </div>
    </div>
  );
}
