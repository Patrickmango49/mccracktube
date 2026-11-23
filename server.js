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

function parseDuration(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = typeof value === "string" ? value : value?.text || value?.toString?.() || "";
  if (!text || text === "[object Object]") return null;
  if (/^\d+(?:\.\d+)?$/.test(text.trim())) return Number(text);
  const parts = text.trim().split(":").map(Number);
  if (!parts.length || parts.length > 3 || parts.some(n => !Number.isFinite(n))) return null;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function normalizeVideo(video) {
  const durationSeconds =
    parseDuration(video.duration?.seconds) ??
    parseDuration(video.length_seconds) ??
    parseDuration(video.duration?.text) ??
    parseDuration(video.duration) ??
    parseDuration(video.length_text);
  const thumbnails = Array.isArray(video.thumbnails) ? video.thumbnails : [];
  const thumb = [...thumbnails].reverse().find(t => Number(t?.width) > 0 && Number(t?.height) > 0) || thumbnails[0];
  const aspectRatio = thumb && Number(thumb.width) > 0 && Number(thumb.height) > 0
    ? Number(thumb.width) / Number(thumb.height) : null;
  return {
    id: video.id,
    title: video.title?.text || video.title?.toString?.() || "Untitled",
    thumbnail: thumb?.url || (video.id ? `https://i.ytimg.com/vi/${encodeURIComponent(video.id)}/hqdefault.jpg` : ""),
    durationSeconds,
    durationLabel: video.duration?.text || (durationSeconds !== null
      ? Math.floor(durationSeconds / 60) + ":" + String(Math.floor(durationSeconds % 60)).padStart(2, "0")
      : ""),
    portraitHint: video.is_short === true || (aspectRatio !== null && aspectRatio < 0.9)
  };
}

async function searchVideos(query) {
  const yt = await getYT();
  const results = await yt.search(query);
  return (results.videos || [])
    .filter(video => video && video.id)
    .map(normalizeVideo)
    .filter(video => video.id && video.thumbnail);
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
    let videos = await searchVideos(query);
    let shorts = videos.filter(video =>
      Number.isFinite(video.durationSeconds) &&
      video.durationSeconds > 0 &&
      video.durationSeconds <= 60
    );
    // Retry once with an explicit Shorts hint if the broad search had no qualifying clips.
    if (!shorts.length) {
      videos = await searchVideos(query + " #shorts");
      shorts = videos.filter(video =>
        Number.isFinite(video.durationSeconds) &&
        video.durationSeconds > 0 &&
        video.durationSeconds <= 60
      );
    }
    shorts.sort((a, b) => Number(b.portraitHint) - Number(a.portraitHint));
    res.json(shorts.slice(0, 24));
  } catch (err) {
    console.error("SHORTS ERROR:", err);
    res.status(503).json({ error: "Shorts discovery is temporarily unavailable" });
  }
});

app.listen(PORT, () => console.log("McCrackTube API listening on port " + PORT));
