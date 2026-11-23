const express = require("express");
const { Innertube } = require("youtubei.js");

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.static("public"));

let youtubePromise;
async function getYT() {
  if (!youtubePromise) {
    youtubePromise = Innertube.create().catch(error => {
      youtubePromise = null;
      throw error;
    });
  }
  return youtubePromise;
}

function textOf(value) {
  if (typeof value === "string") return value;
  if (value && typeof value.text === "string") return value.text;
  if (value && typeof value.toString === "function") {
    const text = value.toString();
    if (text !== "[object Object]") return text;
  }
  return "";
}

function parseDuration(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = textOf(value).trim();
  if (!text) return null;
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  const parts = text.split(":").map(Number);
  if (!parts.length || parts.length > 3 || parts.some(n => !Number.isFinite(n))) return null;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function normalizeVideo(video) {
  const id = video.video_id || video.id || video.content_id || video.entity_id;
  const title =
    textOf(video.title) ||
    textOf(video.metadata?.title) ||
    textOf(video.overlay_metadata?.primary_text) ||
    textOf(video.accessibility_text) ||
    "Untitled Short";
  const thumbnails = [
    ...(Array.isArray(video.thumbnails) ? video.thumbnails : []),
    ...(Array.isArray(video.thumbnail) ? video.thumbnail : []),
    ...(Array.isArray(video.content_image?.image) ? video.content_image.image : [])
  ];
  const best = video.best_thumbnail || thumbnails[thumbnails.length - 1];
  const thumbnail = best?.url || (id ? `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg` : "");
  const durationSeconds =
    parseDuration(video.duration?.seconds) ??
    parseDuration(video.duration) ??
    parseDuration(video.length_seconds) ??
    parseDuration(video.length_text);
  const width = Number(best?.width);
  const height = Number(best?.height);
  return {
    id,
    title,
    thumbnail,
    durationSeconds,
    durationLabel: textOf(video.duration?.text) || textOf(video.length_text),
    portraitHint: video.type === "ShortsLockupView" || (width > 0 && height > 0 && width / height < 0.9)
  };
}

function videosFromSearch(search) {
  // Search#videos is the supported youtubei.js accessor. Keep results as a
  // compatibility fallback for older package versions.
  const items = Array.isArray(search?.videos) ? search.videos :
    Array.isArray(search?.results) ? search.results.filter(item =>
      ["Video", "GridVideo", "CompactVideo", "LockupView", "ShortsLockupView", "ReelItem"].includes(item?.type)
    ) : [];
  return items.map(normalizeVideo).filter(video => video.id && video.thumbnail);
}

async function searchVideos(query) {
  const yt = await getYT();
  const results = await yt.search(query);
  return videosFromSearch(results);
}

async function searchShorts(query) {
  const yt = await getYT();
  const search = await yt.search(query);
  let shortsSearch = search;

  // youtubei.js exposes YouTube's Shorts search refinement directly.
  if (typeof search.applyRefinement === "function") {
    try {
      shortsSearch = await search.applyRefinement("Shorts");
    } catch (error) {
      console.warn("Shorts refinement unavailable; trying the #shorts search fallback:", error.message);
      shortsSearch = await yt.search(query + " #shorts");
    }
  } else {
    shortsSearch = await yt.search(query + " #shorts");
  }

  const candidates = videosFromSearch(shortsSearch);
  const unique = [...new Map(candidates.map(video => [video.id, video])).values()].slice(0, 18);

  // ShortsLockupView does not include duration. Fetch the actual video metadata
  // for those results so the app can reliably enforce its 60-second limit.
  const checked = await Promise.all(unique.map(async video => {
    if (Number.isFinite(video.durationSeconds)) return video;
    try {
      const info = await yt.getBasicInfo(video.id);
      const seconds = parseDuration(info?.basic_info?.duration ?? info?.duration);
      return { ...video, durationSeconds: seconds };
    } catch (error) {
      console.warn("Could not read duration for Short", video.id, error.message);
      return video;
    }
  }));

  return checked.filter(video =>
    Number.isFinite(video.durationSeconds) &&
    video.durationSeconds > 0 &&
    video.durationSeconds <= 60
  );
}

app.get("/health", (req, res) => res.json({ ok: true, service: "McCrackTube API" }));

app.get("/search", async (req, res) => {
  try {
    const query = String(req.query.q || "").trim();
    if (!query) return res.json([]);
    res.json(await searchVideos(query));
  } catch (err) {
    console.error("SEARCH ERROR:", err);
    res.status(503).json({ error: "Search is temporarily unavailable" });
  }
});

app.get("/shorts", async (req, res) => {
  try {
    const query = String(req.query.q || "").trim();
    if (!query) return res.json([]);
    const shorts = await searchShorts(query);
    shorts.sort((a, b) => Number(b.portraitHint) - Number(a.portraitHint));
    res.json(shorts.slice(0, 24));
  } catch (err) {
    console.error("SHORTS ERROR:", err);
    res.status(503).json({ error: "Shorts discovery is temporarily unavailable" });
  }
});

app.listen(PORT, () => console.log("McCrackTube API listening on port " + PORT));
