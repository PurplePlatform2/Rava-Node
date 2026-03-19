// main.js
import express from "express";
import YouTube from "youtube-sr";
import ytdl from "@distube/ytdl-core";

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * 🔍 SEARCH ENDPOINT
 * GET /search?q=keyword
 */
app.get("/search", async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: "Missing query" });

  try {
    const videos = await YouTube.search(q, { limit: 10 });

    const results = videos.map(v => ({
      id: v.id,
      title: v.title,
      duration: v.durationFormatted,
      thumbnail: v.thumbnail.url,
      url: `https://www.youtube.com/watch?v=${v.id}`
    }));

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 🎧 STREAM INFO ENDPOINT
 * GET /stream/:id
 */
app.get("/stream/:id", async (req, res) => {
  const id = req.params.id;

  try {
    const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${id}`);

    const audio = ytdl.chooseFormat(info.formats, { quality: "highestaudio" });
    const video = ytdl.chooseFormat(info.formats, { quality: "highestvideo" });

    res.json({
      title: info.videoDetails.title,
      audio: audio?.url,
      video: video?.url
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * ▶️ PROXY STREAM ENDPOINT
 * GET /play/:id
 */
app.get("/play/:id", (req, res) => {
  const id = req.params.id;

  try {
    res.setHeader("Content-Type", "audio/mpeg");
    ytdl(`https://www.youtube.com/watch?v=${id}`, { quality: "highestaudio" }).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
