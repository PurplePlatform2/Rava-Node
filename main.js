// main.js (CommonJS)
const express = require("express");
const fs = require("fs");
const path = require("path");
const YouTubeSR = require("youtube-sr").default;
const ytdl = require("@distube/ytdl-core");
const cors = require("cors");

// 📂 Cookie file path
const cookiePath = path.join(__dirname, "c.txt");

// 🍪 Cookie array (ALWAYS array)
let cookieArray = [];

if (fs.existsSync(cookiePath)) {
  console.log("✅ c.txt found, loading cookies...");

  try {
    const raw = fs.readFileSync(cookiePath, "utf-8");

    cookieArray = raw
      .split("\n")
      .filter(line => line && !line.startsWith("#"))
      .map(line => {
        const parts = line.split("\t");

        // Skip invalid lines
        if (parts.length < 7) return null;

        return {
          domain: parts[0],
          path: parts[2],
          secure: parts[3] === "TRUE",
          expires: Number(parts[4]) || 0, // ✅ correct key
          name: parts[5],
          value: parts[6]
        };
      })
      .filter(Boolean);

    console.log(`🍪 Loaded ${cookieArray.length} cookies`);
  } catch (err) {
    console.error("❌ Cookie parse error:", err.message);
  }
} else {
  console.warn("⚠️ c.txt NOT found — running without cookies");
}

// 🔌 Agent (OFFICIAL WAY)
const agent = ytdl.createAgent({
  cookies: cookieArray,
  headers: {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
  }
});

// Logger
const log = (type, message, meta = {}) => {
  const timestamp = new Date().toISOString();
  console[type](`[${timestamp}] ${message}`, meta);
};

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

function getLowestAudioFormat(formats) {
  return formats
    .filter(f => f.hasAudio && !f.hasVideo)
    .sort((a, b) => {
      const aBitrate = a.audioBitrate || a.bitrate || 0;
      const bBitrate = b.audioBitrate || b.bitrate || 0;
      return aBitrate - bBitrate;
    })[0];
}

// 🔍 SEARCH
app.get("/search", async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: "Missing query" });

  try {
    log("info", `Searching: ${q}`);
    const videos = await YouTubeSR.search(q, { limit: 10 });

    res.json(
      videos.map(v => ({
        id: v.id,
        title: v.title,
        duration: v.durationFormatted,
        thumbnail: v.thumbnail?.url,
        channel: v.channel?.name || "Unknown Channel",
        url: `https://www.youtube.com/watch?v=${v.id}`
      }))
    );
  } catch (err) {
    log("error", "Search error", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// 🎧 STREAM INFO
app.get("/stream/:id", async (req, res) => {
  const url = `https://www.youtube.com/watch?v=${req.params.id}`;

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
    log("error", "Stream error", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ▶️ PLAY
app.get("/play/:id", async (req, res) => {
  const url = `https://www.youtube.com/watch?v=${req.params.id}`;

  try {
    const info = await ytdl.getInfo(url, { agent });
    const audio = getLowestAudioFormat(info.formats);

    if (!audio) throw new Error("No audio format");

    res.setHeader("Content-Type", "audio/mpeg");

    ytdl.downloadFromInfo(info, {
      format: audio,
      filter: "audioonly",
      agent
    }).pipe(res);

  } catch (err) {
    log("error", "Play error", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  log("info", `Server running on port ${PORT}`);
});
