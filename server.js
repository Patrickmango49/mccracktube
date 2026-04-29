const express = require("express");
const { Innertube } = require("youtubei.js");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

let youtube;

async function initYT() {
  youtube = await Innertube.create();
}
initYT();

app.get("/search", async (req, res) => {
  try {
    const query = req.query.q;
    const results = await youtube.search(query);

    const videos = results.videos.map(v => ({
      id: v.id,
      title: v.title.text,
      thumbnail: v.thumbnails[0]?.url
    }));

    res.json(videos);
  } catch (err) {
    res.json([]);
  }
});

app.listen(PORT, () => {
  console.log("McCrackTube running on port " + PORT);
});