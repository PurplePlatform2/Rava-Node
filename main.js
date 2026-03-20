// main.js (CommonJS)
const express = require("express");
const fs = require("fs");
const path = require("path");
const YouTubeSR = require("youtube-sr").default;
const ytdl = require("@distube/ytdl-core");
const cors = require("cors");

// 📂 Load cookies from c.txt
const cookiePath = path.join(__dirname, "c.txt");
let cookies = "";

try {
  cookies = fs.readFileSync(cookiePath, "utf-8")
    .split("\n")
    .filter(line => line && !line.startsWith("#"))
    .map(line => {
      const parts = line.split("\t");
      return `${parts[5]}=${parts[6]}`;
    })
    .join("; ");

  console.log("✅ Cookies loaded successfully");
} catch (err) {
  console.error("❌ Failed to load cookies:", err.message);
}

// 🔌 Create agent with cookies
const agent = ytdl.createAgent({
  headers: {
    cookie: cookies,
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
  }
});

// Logger utility
const log = (type, message, meta = {}) => {
  const timestamp = new Date().toISOString();
  console[type](`[${timestamp}] ${message}`, meta);
};

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/**
 * 🎯 Helper: Get TRUE lowest audio format
 */
function getLowestAudioFormat(formats) {
  return formats
    .filter(f => f.hasAudio && !f.hasVideo)
    .sort((a, b) => {
      const aBitrate = a.audioBitrate || a.bitrate || 0;
      const bBitrate = b.audioBitrate || b.bitrate || 0;
      return aBitrate - bBitrate;
    })[0];
}

// 🔍 SEARCH ENDPOINT
app.get("/search", async (req, res) => {
  const q = req.query.q;
  if (!q) {
    log("warn", "Search request missing query", { query: q });
    return res.status(400).json({ error: "Missing query" });
  }

  try {
    log("info", `Searching YouTube for: "${q}"`);
    const videos = await YouTubeSR.search(q, { limit: 10 });

    const results = videos.map(v => ({
      id: v.id,
      title: v.title,
      duration: v.durationFormatted,
      thumbnail: v.thumbnail?.url,
      channel: v.channel?.name || "Unknown Channel",
      url: `https://www.youtube.com/watch?v=${v.id}`
    }));

    res.json(results);
  } catch (err) {
    log("error", "Search error", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// 🎧 STREAM INFO (LOWEST AUDIO)
app.get("/stream/:id", async (req, res) => {
  const id = req.params.id;
  const url = `https://www.youtube.com/watch?v=${id}`;

  log("info", `Fetching LOWEST audio for ID: ${id}`);

  try {
    const info = await ytdl.getInfo(url, { agent });

    const audio = getLowestAudioFormat(info.formats);

    res.json({
      title: info.videoDetails.title,
      audio: audio?.url,
      bitrate: audio?.audioBitrate || audio?.bitrate,
      channel: info.videoDetails.author?.name || "Unknown Channel"
    });
  } catch (err) {
    log("error", "Stream info error", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ▶️ PROXY STREAM (LOWEST AUDIO)
app.get("/play/:id", async (req, res) => {
  const id = req.params.id;
  const url = `https://www.youtube.com/watch?v=${id}`;

  log("info", `Streaming LOWEST audio for ID: ${id}`);

  try {
    const info = await ytdl.getInfo(url, { agent });

    const audio = getLowestAudioFormat(info.formats);
    if (!audio) throw new Error("No audio format found");

    res.setHeader("Content-Type", "audio/mpeg");

    ytdl.downloadFromInfo(info, {
      format: audio,
      filter: "audioonly",
      agent
    })
      .on("error", err => {
        log("error", "Streaming error", { error: err.message });
        res.status(500).end();
      })
      .pipe(res);

  } catch (err) {
    log("error", "Play error", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  log("info", `Server running on http://localhost:${PORT}`);
});
