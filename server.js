const express = require("express");
const { Innertube } = require("youtubei.js");

const app = express();
const PORT = process.env.PORT || 3000;

// Serve frontend files from /public
app.use(express.static("public"));

let youtube = null;

/**
 * Create Innertube instance once, then reuse it
 */
async function getYT() {
  if (!youtube) {
    youtube = await Innertube.create();
    console.log("Innertube ready");
  }
  return youtube;
}

/**
 * Search route
 * Example:
 * /search?q=mrbeast
 */
app.get("/search", async (req, res) => {
  try {
    const query = req.query.q || "";

    if (!query.trim()) {
      return res.json([]);
    }

    const yt = await getYT();
    const results = await yt.search(query);

    const videos = (results.videos || [])
      .filter(v => v && v.id)
      .map(v => ({
        id: v.id,
        title:
          v.title?.text ||
          v.title?.toString?.() ||
          "Untitled",
        thumbnail:
          v.thumbnails?.[0]?.url ||
          ""
      }));

    res.json(videos);

  } catch (err) {
    console.error("SEARCH ERROR:", err);
    res.status(500).json({
      error: err.message || "Search failed"
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log("McCrackTube running on port " + PORT);
});