const express = require("express");
const { Innertube } = require("youtubei.js");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

let youtube = null;

async function getYT() {
  if (!youtube) {
    youtube = await Innertube.create();
    console.log("Innertube ready");
  }
  return youtube;
}

app.get("/search", async (req, res) => {
  try {
    const query = req.query.q || "";
    const yt = await getYT();

    const results = await yt.search(query);

    const videos = results.videos.map(v => ({
      id: v.id,
      title: v.title.text,
      thumbnail: v.thumbnails?.[0]?.url
    }));

    res.json(videos);
  } catch (err) {
    console.error("SEARCH ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log("Running on port " + PORT);
});