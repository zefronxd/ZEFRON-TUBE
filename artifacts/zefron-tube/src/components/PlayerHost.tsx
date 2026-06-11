import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "wouter";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Loader2,
  Gauge,
  AlertCircle,
  Download,
  X,
  Maximize2,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchStream, formatDuration, markBroken } from "@/lib/api";
import { useZefron } from "@/lib/store";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/**
 * Global persistent player. Mounts ONE <video> element for the lifetime of
 * the app. The element is fixed-positioned and overlays whichever DOM slot
 * is currently relevant:
 *   - On /watch the watch route renders <div id="player-slot" /> and we
 *     pin the video over it (full mode).
 *   - On any other route the video shrinks to a bottom-right mini card.
 *   - When closed, it hides entirely.
 *
 * Because the <video> is never unmounted, navigating between pages does NOT
 * pause/restart playback.
 */
export function PlayerHost() {
  const [path] = useLocation();
  const player = useZefron((s) => s.player);
  const setPlayer = useZefron((s) => s.setPlayer);
  const closePlayer = useZefron((s) => s.closePlayer);
  const refetchStream = useZefron((s) => s.refetchStream);
  const pushHistory = useZefron((s) => s.pushHistory);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastTapRef = useRef<{ side: "L" | "R"; t: number } | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slotRectRef = useRef<DOMRect | null>(null);
  const recoveryStageRef = useRef<Map<string, number>>(new Map());

  const [streamSrc, setStreamSrc] = useState<string>("");
  const [streamError, setStreamError] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [seekFlash, setSeekFlash] = useState<null | "L" | "R">(null);
  const [downloading, setDownloading] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);

  const v = player.video;
  const onWatchPage = path === "/watch";

  useEffect(() => {
    if (!v) return;
    if (onWatchPage && player.mode !== "full") {
      setPlayer({ mode: "full" });
    } else if (!onWatchPage && player.mode === "full") {
      setPlayer({ mode: "mini" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, v?.id]);

  useEffect(() => {
    if (!v) {
      setStreamSrc("");
      return;
    }
    const stage = recoveryStageRef.current.get(v.id) ?? 0;
    const useDirect = (v.videoUrl || v.audioUrl) && player.refetchKey === 0 && stage === 0;
    if (useDirect) {
      setStreamSrc(v.videoUrl || v.audioUrl || "");
      setStreamError(false);
      return;
    }
    if (!v.youtubeUrl) return;
    const ctl = new AbortController();
    setResolving(true);
    setStreamError(false);
    fetchStream(v.youtubeUrl, ctl.signal, {
      bypassCache: stage >= 1,
      forceBackup: stage >= 2,
    })
      .then((fresh) => {
        setStreamSrc(fresh.videoUrl || fresh.audioUrl || "");
        setResolving(false);
      })
      .catch((e) => {
        if ((e as Error).name === "AbortError") return;
        setStreamError(true);
        setResolving(false);
      });
    return () => ctl.abort();
  }, [v?.id, player.refetchKey]);

  useEffect(() => {
    if (!v) return;
    pushHistory({
      id: v.id,
      title: v.title,
      channelName: v.channelName,
      thumbnail: v.thumbnail,
      youtubeUrl: v.youtubeUrl ?? "",
      durationSeconds: v.durationSeconds,
      watchedSeconds: 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v?.id]);

  useEffect(() => {
    if (!v || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: v.title,
        artist: v.channelName,
        album: "Zefron Tube",
        artwork: [
          { src: v.thumbnail, sizes: "320x180", type: "image/jpeg" },
          { src: v.thumbnail, sizes: "640x360", type: "image/jpeg" },
          { src: v.thumbnail, sizes: "1280x720", type: "image/jpeg" },
        ],
      });
      navigator.mediaSession.setActionHandler("play", () => videoRef.current?.play());
      navigator.mediaSession.setActionHandler("pause", () => videoRef.current?.pause());
      navigator.mediaSession.setActionHandler("seekbackward", () => seek(current - 10));
      navigator.mediaSession.setActionHandler("seekforward", () => seek(current + 10));
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v?.id, v?.thumbnail, v?.title]);

  const updatePosition = useCallback(() => {
    const c = containerRef.current;
    if (!c) return;
    if (player.mode === "hidden" || !v) {
      c.style.opacity = "0";
      c.style.pointerEvents = "none";
      return;
    }
    c.style.opacity = "1";
    c.style.pointerEvents = "auto";

    if (player.mode === "full") {
      const slot = document.getElementById("player-slot");
      const rect = slot?.getBoundingClientRect();
      if (rect) {
        slotRectRef.current = rect;
        c.style.top = `${rect.top}px`;
        c.style.left = `${rect.left}px`;
        c.style.width = `${rect.width}px`;
        c.style.height = `${rect.height}px`;
        c.style.borderRadius = "1rem";
      }
    } else {
      const isMobile = window.innerWidth < 1024;
      const w = isMobile ? Math.min(window.innerWidth - 24, 320) : 360;
      const h = (w * 9) / 16;
      const right = isMobile ? 12 : 24;
      const bottom = isMobile ? 76 : 24;
      c.style.left = `${window.innerWidth - w - right}px`;
      c.style.top = `${window.innerHeight - h - bottom - 64}px`;
      c.style.width = `${w}px`;
      c.style.height = `${h + 64}px`;
      c.style.borderRadius = "1rem";
    }
  }, [player.mode, v]);

  useEffect(() => {
    updatePosition();
    const onResize = () => updatePosition();
    const onScroll = () => { if (player.mode === "full") updatePosition(); };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [updatePosition, player.mode]);

  useEffect(() => {
    const id = setTimeout(updatePosition, 50);
    return () => clearTimeout(id);
  }, [path, updatePosition]);

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().then(() => setNeedsTap(false)).catch(() => setNeedsTap(true));
    } else {
      el.pause();
    }
  }, []);

  const seek = useCallback((seconds: number) => {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(el.duration || 0, seconds));
  }, []);

  const toggleMute = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const c = containerRef.current;
    if (!c) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      c.requestFullscreen?.().then(() => {
        const so = (screen as unknown as { orientation?: { lock?: (s: string) => Promise<void> } }).orientation;
        if (so?.lock) so.lock("landscape").catch(() => undefined);
      });
    }
  }, []);

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShowControls(false);
    }, 2800);
  }, []);

  const onSurfaceClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (player.mode !== "full") return;
    const target = e.target as HTMLElement;
    if (target.tagName !== "VIDEO" && target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const side: "L" | "R" = x < rect.width / 2 ? "L" : "R";
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && last.side === side && now - last.t < 300) {
      lastTapRef.current = null;
      const delta = side === "L" ? -10 : 10;
      seek((videoRef.current?.currentTime || 0) + delta);
      setSeekFlash(side);
      setTimeout(() => setSeekFlash(null), 500);
    } else {
      lastTapRef.current = { side, t: now };
      setTimeout(() => {
        if (lastTapRef.current && lastTapRef.current.t === now) {
          togglePlay();
          lastTapRef.current = null;
        }
      }, 280);
    }
  };

  useEffect(() => {
    if (player.mode !== "full") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === " ") { e.preventDefault(); togglePlay(); }
      else if (e.key === "ArrowRight") seek((videoRef.current?.currentTime || 0) + 5);
      else if (e.key === "ArrowLeft") seek((videoRef.current?.currentTime || 0) - 5);
      else if (e.key.toLowerCase() === "m") toggleMute();
      else if (e.key.toLowerCase() === "f") toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [player.mode, togglePlay, seek, toggleMute, toggleFullscreen]);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const downloadVideo = async () => {
    if (!v || !streamSrc) return;
    setDownloading(true);
    try {
      const res = await fetch(streamSrc);
      if (!res.ok) throw new Error("download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeTitle = v.title.replace(/[^\w\s.-]+/g, "").slice(0, 80) || "zefron-video";
      a.download = `${safeTitle}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(streamSrc, "_blank");
    } finally {
      setDownloading(false);
    }
  };

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const progress = duration > 0 ? (current / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0;
  const isMini = player.mode === "mini";
  const isFull = player.mode === "full";

  return createPortal(
    <div
      ref={containerRef}
      className={cn(
        "fixed z-50 overflow-hidden bg-black shadow-elevated transition-[top,left,width,height,border-radius] duration-300 ease-out",
        isMini && "border border-border bg-card",
      )}
      style={{ top: 0, left: 0, width: 0, height: 0, opacity: 0 }}
      onMouseMove={isFull ? resetHideTimer : undefined}
      onMouseLeave={() => {
        if (videoRef.current && !videoRef.current.paused && isFull) setShowControls(false);
      }}
    >
      <div
        className={cn("relative bg-black", isMini ? "h-[calc(100%-64px)] w-full" : "h-full w-full")}
        onClick={onSurfaceClick}
      >
        <video
          ref={videoRef}
          {...(streamSrc ? { src: streamSrc } : {})}
          poster={v?.thumbnail}
          playsInline
          preload="auto"
          autoPlay
          className="h-full w-full bg-black"
          onPlay={() => {
            setPlaying(true);
            setNeedsTap(false);
            if (isFull) resetHideTimer();
          }}
          onPause={() => {
            setPlaying(false);
            if (isFull) setShowControls(true);
          }}
          onWaiting={() => setLoading(true)}
          onCanPlay={() => {
            setLoading(false);
            if (videoRef.current?.paused) {
              videoRef.current.play().catch(() => setNeedsTap(true));
            }
          }}
          onPlaying={() => setLoading(false)}
          onLoadedMetadata={(e) => {
            setDuration(e.currentTarget.duration || 0);
            if (player.position && player.position < e.currentTarget.duration) {
              try { e.currentTarget.currentTime = player.position; } catch { /* ignore */ }
            }
          }}
          onTimeUpdate={(e) => {
            const t = e.currentTarget.currentTime;
            setCurrent(t);
            setPlayer({ position: t });
            const b = e.currentTarget.buffered;
            if (b.length > 0) setBuffered(b.end(b.length - 1));
            if (v && Math.floor(t) % 5 === 0 && t > 1) {
              pushHistory({
                id: v.id,
                title: v.title,
                channelName: v.channelName,
                thumbnail: v.thumbnail,
                youtubeUrl: v.youtubeUrl ?? "",
                durationSeconds: v.durationSeconds,
                watchedSeconds: Math.floor(t),
              });
            }
          }}
          onError={() => {
            setLoading(false);
            if (!v?.id) { setStreamError(true); return; }
            const stage = recoveryStageRef.current.get(v.id) ?? 0;
            if (stage < 2) {
              recoveryStageRef.current.set(v.id, stage + 1);
              refetchStream();
              return;
            }
            setStreamError(true);
            markBroken(v.id);
            window.dispatchEvent(new CustomEvent("zefron:videobroken"));
          }}
          onEnded={() => {
            window.dispatchEvent(new CustomEvent("zefron:videoended"));
          }}
          onVolumeChange={(e) => {
            setMuted(e.currentTarget.muted);
            setVolume(e.currentTarget.volume);
          }}
        />

        {(loading || resolving) && !streamError && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          </div>
        )}

        {streamError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 px-4 text-center text-white">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-xs sm:text-sm">Stream link expired. Refreshing…</p>
            <button
              onClick={() => refetchStream()}
              className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-black"
            >
              <RotateCcw className="h-3 w-3" /> Retry now
            </button>
          </div>
        )}

        {needsTap && !streamError && (
          <button
            onClick={togglePlay}
            className="absolute inset-0 flex items-center justify-center bg-black/40 text-white"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 text-black shadow-elevated">
              <Play className="h-7 w-7 fill-current" />
            </span>
          </button>
        )}

        {isFull && !playing && !loading && !streamError && !needsTap && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white/95 text-black shadow-elevated">
              <Play className="h-8 w-8 fill-current" />
            </span>
          </div>
        )}

        {isFull && seekFlash && (
          <div
            className={cn(
              "pointer-events-none absolute inset-y-0 flex w-1/2 items-center justify-center bg-white/10 text-white",
              seekFlash === "L" ? "left-0" : "right-0",
            )}
          >
            <div className="rounded-full bg-black/60 px-4 py-2 text-sm font-semibold">
              {seekFlash === "L" ? "−10s" : "+10s"}
            </div>
          </div>
        )}

        {isMini && (
          <Link
            href={`/watch?v=${v?.id ?? ""}`}
            className="absolute inset-0"
            aria-label="Expand player"
          />
        )}

        {isMini && (
          <div className="absolute right-1.5 top-1.5 z-10 flex gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                togglePlay();
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                videoRef.current?.pause();
                closePlayer();
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {isFull && (
          <div
            className={cn(
              "pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pt-10 pb-3 transition-opacity duration-300 sm:px-4 sm:pb-4",
              showControls || !playing ? "opacity-100" : "opacity-0",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="pointer-events-auto group/seek relative mb-2 h-3 cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                seek(pct * duration);
              }}
            >
              <div className="absolute left-0 top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-white/25">
                <div className="absolute inset-y-0 left-0 rounded-full bg-white/40" style={{ width: `${bufferedPct}%` }} />
                <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${progress}%` }} />
                <div
                  className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary opacity-0 transition-opacity group-hover/seek:opacity-100"
                  style={{ left: `${progress}%` }}
                />
              </div>
            </div>

            <div className="pointer-events-auto flex items-center gap-2 text-white sm:gap-3">
              <button onClick={togglePlay} aria-label={playing ? "Pause" : "Play"} className="p-1.5">
                {playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
              </button>

              <div className="hidden items-center gap-2 sm:flex">
                <button onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} className="p-1.5">
                  {muted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  onChange={(e) => {
                    const el = videoRef.current;
                    if (!el) return;
                    el.volume = Number(e.target.value);
                    el.muted = false;
                  }}
                  style={{ ["--val" as string]: `${(muted ? 0 : volume) * 100}` }}
                  className="player-range w-24"
                />
              </div>

              <button onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} className="p-1.5 sm:hidden">
                {muted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>

              <div className="ml-1 text-xs tabular-nums text-white/90 sm:text-sm">
                {formatDuration(Math.floor(current))} / {duration > 0 ? formatDuration(Math.floor(duration)) : "—"}
              </div>

              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={downloadVideo}
                  disabled={downloading}
                  aria-label="Download"
                  title="Download"
                  className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-50"
                >
                  {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  )}
                </button>
                <div className="relative">
                  <button
                    onClick={() => setShowSpeedMenu((s) => !s)}
                    aria-label="Playback speed"
                    className="flex items-center gap-1 rounded-full px-2 py-1.5 text-xs hover:bg-white/15"
                  >
                    <Gauge className="h-4 w-4" />
                    <span className="tabular-nums">{speed}×</span>
                  </button>
                  {showSpeedMenu && (
                    <div className="absolute bottom-full right-0 mb-2 w-24 overflow-hidden rounded-xl bg-black/90 p-1 backdrop-blur-md">
                      {SPEEDS.map((s) => (
                        <button
                          key={s}
                          onClick={() => {
                            setSpeed(s);
                            if (videoRef.current) videoRef.current.playbackRate = s;
                            setShowSpeedMenu(false);
                          }}
                          className={cn(
                            "block w-full rounded-lg px-3 py-1.5 text-left text-xs hover:bg-white/15",
                            s === speed && "text-primary",
                          )}
                        >
                          {s}×
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={toggleFullscreen}
                  aria-label={fullscreen ? "Exit fullscreen" : "Landscape fullscreen"}
                  className="p-1.5"
                >
                  {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {isMini && v && (
        <div className="flex h-16 items-center gap-2 px-3">
          <div className="min-w-0 flex-1">
            <p className="line-clamp-1 text-xs font-medium text-foreground">{v.title}</p>
            <p className="line-clamp-1 text-[11px] text-muted-foreground">{v.channelName}</p>
          </div>
          <Link
            href={`/watch?v=${v.id}`}
            aria-label="Expand"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Maximize2 className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>,
    document.body,
  );
}
