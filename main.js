// main.js
import express from "express";
import YouTube from "youtube-sr";
import ytdl from "@distube/ytdl-core";
import cors from "cors";

// Utility logger
const log = (type, message, meta = {}) => {
  const timestamp = new Date().toISOString();
  console[type](`[${timestamp}] ${message}`, meta);
};

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// 🔍 SEARCH ENDPOINT
app.get("/search", async (req, res) => {
  const q = req.query.q;
  if (!q) {
    log("warn", "Search request missing query", { query: q, path: req.path });
    return res.status(400).json({ error: "Missing query" });
  }

  try {
    log("info", `Searching YouTube for: "${q}"`);
    const videos = await YouTube.search(q, { limit: 10 });

    const results = videos.map(v => ({
      id: v.id,
      title: v.title,
      duration: v.durationFormatted,
      thumbnail: v.thumbnail.url,
      url: `https://www.youtube.com/watch?v=${v.id}`
    }));

    log("info", `Search results for "${q}" returned ${results.length} items`);
    res.json(results);
  } catch (err) {
    log("error", "Error during YouTube search", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// 🎧 STREAM INFO ENDPOINT
app.get("/stream/:id", async (req, res) => {
  const id = req.params.id;
  log("info", `Fetching stream info for video ID: ${id}`);

  try {
    const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${id}`);
    const audio = ytdl.chooseFormat(info.formats, { quality: "highestaudio" });
    const video = ytdl.chooseFormat(info.formats, { quality: "highestvideo" });

    log("info", `Stream info fetched for ID: ${id}`, { title: info.videoDetails.title });
    res.json({
      title: info.videoDetails.title,
      audio: audio?.url,
      video: video?.url
    });
  } catch (err) {
    log("error", `Failed to fetch stream info for ID: ${id}`, { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ▶️ PROXY STREAM ENDPOINT
app.get("/play/:id", (req, res) => {
  const id = req.params.id;
  log("info", `Proxy streaming audio for video ID: ${id}`);

  try {
    res.setHeader("Content-Type", "audio/mpeg");
    ytdl(`https://www.youtube.com/watch?v=${id}`, { quality: "highestaudio" })
      .on("error", err => {
        log("error", `Streaming error for ID: ${id}`, { error: err.message });
        res.status(500).json({ error: err.message });
      })
      .pipe(res);
  } catch (err) {
    log("error", `Unexpected error streaming ID: ${id}`, { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// Start server
app.listen(PORT, () => {
  log("info", `Server running on http://localhost:${PORT}`);
});
