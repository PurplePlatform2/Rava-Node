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
// 📂 LOAD COOKIES (JSON → HEADER STRING)
// ==========================
const cookiePath = path.join(__dirname, "c.json");

let cookieHeader = "";

try {
  log("info", "Loading cookies.json...", { path: cookiePath });

  if (!fs.existsSync(cookiePath)) {
    throw new Error("c.json not found");
  }

  const raw = fs.readFileSync(cookiePath, "utf-8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error("c.json must be an array");
  }

  const validCookies = parsed
    .filter(c => c.name && c.value)
    .map(c => `${c.name}=${c.value}`);

  cookieHeader = validCookies.join("; ");

  log("info", "✅ Cookies prepared for header", {
    count: validCookies.length,
    preview: validCookies.slice(0, 3)
  });

} catch (err) {
  log("error", "❌ Cookie load failed", { error: err.message });
  cookieHeader = "";
}

// ==========================
// 🌐 COMMON REQUEST OPTIONS
// ==========================
const REQUEST_OPTIONS = {
  requestOptions: {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "accept-language": "en-US,en;q=0.9",
      ...(cookieHeader ? { cookie: cookieHeader } : {})
    }
  }
};

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
    const info = await ytdl.getInfo(url, REQUEST_OPTIONS);

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
    const info = await ytdl.getInfo(url, REQUEST_OPTIONS);

    const audio = getLowestAudioFormat(info.formats);
    if (!audio) throw new Error("No audio format");

    res.setHeader("Content-Type", "audio/mpeg");

    ytdl(url, {
      ...REQUEST_OPTIONS,
      format: audio,
      filter: "audioonly"
    })
      .on("error", err => {
        log("error", "Streaming pipe error", { error: err.message });
        if (!res.headersSent) res.status(500).end();
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
    cookiesLoaded: cookieHeader ? cookieHeader.split(";").length : 0,
    timestamp: new Date().toISOString()
  });
});

// ==========================
// 🚀 START SERVER
// ==========================
app.listen(PORT, () => {
  log("info", "🚀 Server running", {
    url: `http://localhost:${PORT}`,
    port: PORT
  });
});
