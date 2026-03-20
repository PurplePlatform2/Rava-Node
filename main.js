// main.js (CommonJS)

const express = require("express");
const fs = require("fs");
const path = require("path");
const YouTubeSR = require("youtube-sr").default;
const ytdl = require("@distube/ytdl-core");
const cors = require("cors");

// ==========================
// 🔧 LOGGER
// ==========================
const log = (type, message, meta = {}) => {
  const timestamp = new Date().toISOString();
  console[type](`[${timestamp}] ${message}`, meta);
};

// ==========================
// 📂 LOAD COOKIES SAFELY
// ==========================
const cookiePath = path.join(__dirname, "c.txt");

let cookieArray = [];

try {
  log("info", "Loading cookies...", { path: cookiePath });

  const raw = fs.readFileSync(cookiePath, "utf-8");

  cookieArray = raw
    .split(/\r?\n/) // ✅ handles Windows/Linux
    .filter(line => line && !line.startsWith("#"))
    .map(line => {
      // ✅ handles BOTH tab and space formats
      const parts = line.trim().split(/\s+/);

      if (parts.length < 7) return null;

      return {
        domain: parts[0],
        path: parts[2],
        secure: parts[3] === "TRUE",
        expirationDate: Number(parts[4]) || undefined,
        name: parts[5],
        value: parts[6],
        httpOnly: false
      };
    })
    .filter(Boolean);

  if (!Array.isArray(cookieArray)) {
    throw new Error("Parsed cookies is not an array");
  }

  log("info", `✅ Cookies loaded`, {
    count: cookieArray.length,
    sample: cookieArray[0]
  });

} catch (err) {
  log("error", "❌ Cookie load failed", { error: err.message });

  // 🔥 NEVER let this crash your app
  cookieArray = [];
}

// ==========================
// 🔌 SAFE AGENT CREATION
// ==========================
let agent;

try {
  agent = ytdl.createAgent({
    cookies: Array.isArray(cookieArray) ? cookieArray : [],
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "accept-language": "en-US,en;q=0.9"
    }
  });

  log("info", "✅ ytdl agent created successfully");

} catch (err) {
  log("error", "❌ Agent creation failed", { error: err.message });

  // fallback agent (no cookies)
  agent = ytdl.createAgent({
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
  });
}

// ==========================
// 🚀 EXPRESS APP
// ==========================
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ==========================
// 🎯 LOWEST AUDIO SELECTOR
// ==========================
function getLowestAudioFormat(formats) {
  return formats
    .filter(f => f.hasAudio && !f.hasVideo)
    .sort((a, b) => {
      const aBitrate = a.audioBitrate || a.bitrate || 0;
      const bBitrate = b.audioBitrate || b.bitrate || 0;
      return aBitrate - bBitrate;
    })[0];
}

// ==========================
// 🔍 SEARCH
// ==========================
app.get("/search", async (req, res) => {
  const q = req.query.q;

  if (!q) {
    log("warn", "Search missing query");
    return res.status(400).json({ error: "Missing query" });
  }

  try {
    log("info", `Searching: ${q}`);

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
    log("error", "Search failed", { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ==========================
// 🎧 STREAM INFO
// ==========================
app.get("/stream/:id", async (req, res) => {
  const id = req.params.id;
  const url = `https://www.youtube.com/watch?v=${id}`;

  log("info", "Fetching stream info", { id });

  try {
    const info = await ytdl.getInfo(url, { agent });

    const audio = getLowestAudioFormat(info.formats);

    if (!audio) throw new Error("No audio format found");

    res.json({
      title: info.videoDetails.title,
      audio: audio.url,
      bitrate: audio.audioBitrate || audio.bitrate,
      channel: info.videoDetails.author?.name || "Unknown Channel"
    });

  } catch (err) {
    log("error", "Stream info failed", {
      id,
      error: err.message
    });

    res.status(500).json({ error: err.message });
  }
});

// ==========================
// ▶️ PLAY AUDIO STREAM
// ==========================
app.get("/play/:id", async (req, res) => {
  const id = req.params.id;
  const url = `https://www.youtube.com/watch?v=${id}`;

  log("info", "Streaming audio", { id });

  try {
    const info = await ytdl.getInfo(url, { agent });

    const audio = getLowestAudioFormat(info.formats);
    if (!audio) throw new Error("No audio format");

    res.setHeader("Content-Type", "audio/mpeg");

    ytdl
      .downloadFromInfo(info, {
        format: audio,
        filter: "audioonly",
        agent
      })
      .on("error", err => {
        log("error", "Streaming pipe error", { error: err.message });
        if (!res.headersSent) {
          res.status(500).end();
        }
      })
      .pipe(res);

  } catch (err) {
    log("error", "Play failed", { id, error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ==========================
// ❤️ HEALTH CHECK
// ==========================
app.get("/", (req, res) => {
  res.json({
    status: "OK",
    cookiesLoaded: cookieArray.length,
    timestamp: new Date().toISOString()
  });
});

// ==========================
// 🚀 START SERVER
// ==========================
app.listen(PORT, () => {
  log("info", `🚀 Server running`, {
    url: `http://localhost:${PORT}`,
    port: PORT
  });
});
