const express = require('express');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const router = express.Router();

// Extract video ID from various YouTube URL formats
function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Check if yt-dlp is available on the system
let _ytDlpAvailable = null;
async function isYtDlpAvailable() {
  if (_ytDlpAvailable !== null) return _ytDlpAvailable;
  return new Promise((resolve) => {
    execFile('yt-dlp', ['--version'], { timeout: 5000 }, (error) => {
      _ytDlpAvailable = !error;
      resolve(_ytDlpAvailable);
    });
  });
}

// ─── Direct YouTube Caption Extraction (no npm deps) ───────────────────────

// Fetch the YouTube watch page and extract player data
async function fetchPlayerData(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`YouTube page fetch failed: ${res.status}`);
  const html = await res.text();

  // Extract ytInitialPlayerResponse
  const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?})\s*;/);
  if (!playerMatch) throw new Error('Could not find player data in page');

  try {
    return JSON.parse(playerMatch[1]);
  } catch {
    throw new Error('Failed to parse player data');
  }
}

// Extract caption tracks from player data
function getCaptionTracks(playerData) {
  const captions = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!captions || captions.length === 0) return [];
  return captions;
}

// Fetch and parse a caption track URL (returns XML with text segments)
async function fetchCaptionTrack(trackUrl) {
  const res = await fetch(trackUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
  if (!res.ok) throw new Error(`Caption track fetch failed: ${res.status}`);
  const xml = await res.text();

  // Parse XML caption segments: <text start="1.23" dur="4.56">caption text</text>
  const segments = [];
  const regex = /<text[^>]*>([^<]*)<\/text>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    // Decode HTML entities
    const text = match[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n/g, ' ')
      .trim();
    if (text) segments.push(text);
  }
  return segments;
}

// Method 1: Direct caption extraction from YouTube page (no dependencies)
async function tryDirectCaptions(videoId) {
  console.log(`[YouTube] Fetching page for ${videoId}...`);
  const playerData = await fetchPlayerData(videoId);

  // Get video title from player data
  const title = playerData?.videoDetails?.title || `YouTube Video (${videoId})`;

  const tracks = getCaptionTracks(playerData);
  if (tracks.length === 0) {
    throw new Error('No caption tracks available for this video');
  }

  // Prefer English, then auto-generated English, then first available
  const englishTrack = tracks.find(t => t.languageCode === 'en' && t.kind !== 'asr')
    || tracks.find(t => t.languageCode === 'en')
    || tracks[0];

  console.log(`[YouTube] Found caption track: ${englishTrack.name?.simpleText || englishTrack.languageCode} (${englishTrack.kind || 'manual'})`);

  const segments = await fetchCaptionTrack(englishTrack.baseUrl);
  const transcript = segments.join(' ');
  if (!transcript.trim()) throw new Error('Caption track returned empty text');

  return { transcript, title, method: 'captions' };
}

// Method 2: youtube-transcript npm library (backup caption method)
async function tryYoutubeTranscriptLib(videoId) {
  const { YoutubeTranscript } = require('youtube-transcript');
  const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
  const transcript = transcriptItems.map(item => item.text).join(' ');
  if (!transcript.trim()) throw new Error('Empty transcript');
  return { transcript, method: 'captions' };
}

// ─── Audio Download Methods ────────────────────────────────────────────────

// Download audio using yt-dlp (system binary)
function downloadAudioYtDlp(videoId) {
  return new Promise((resolve, reject) => {
    const tmpDir = os.tmpdir();
    const outputPath = path.join(tmpDir, `yt-audio-${videoId}-${Date.now()}.mp3`);

    execFile('yt-dlp', [
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '5',
      '-o', outputPath,
      '--no-playlist',
      '--max-filesize', '25m',
      `https://www.youtube.com/watch?v=${videoId}`,
    ], {
      timeout: 120000,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`yt-dlp failed: ${stderr || error.message}`));
        return;
      }
      const files = fs.readdirSync(tmpDir).filter(f => f.startsWith(`yt-audio-${videoId}`));
      if (files.length > 0) {
        resolve(path.join(tmpDir, files[files.length - 1]));
      } else if (fs.existsSync(outputPath)) {
        resolve(outputPath);
      } else {
        reject(new Error('Audio file not found after yt-dlp download'));
      }
    });
  });
}

// Download audio using youtubei.js (pure Node.js)
async function downloadAudioInnertube(videoId) {
  const { Innertube } = require('youtubei.js');
  const tmpDir = os.tmpdir();
  const outputPath = path.join(tmpDir, `yt-audio-${videoId}-${Date.now()}.webm`);

  const yt = await Innertube.create();
  const stream = await yt.download(videoId, { type: 'audio', quality: 'best' });
  const writeStream = fs.createWriteStream(outputPath);

  for await (const chunk of stream) {
    writeStream.write(chunk);
  }
  writeStream.end();

  return new Promise((resolve, reject) => {
    writeStream.on('finish', () => {
      const stats = fs.statSync(outputPath);
      if (stats.size < 1000) {
        fs.unlinkSync(outputPath);
        reject(new Error('Downloaded audio file too small'));
      } else {
        resolve(outputPath);
      }
    });
    writeStream.on('error', reject);
  });
}

// Download audio using @distube/ytdl-core (pure Node.js)
async function downloadAudioYtdlCore(videoId) {
  const ytdl = require('@distube/ytdl-core');
  const tmpDir = os.tmpdir();
  const outputPath = path.join(tmpDir, `yt-audio-${videoId}-${Date.now()}.webm`);

  const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${videoId}`);
  const format = ytdl.chooseFormat(info.formats, { quality: 'lowestaudio', filter: 'audioonly' });
  if (!format) throw new Error('No audio format available via ytdl-core');

  return new Promise((resolve, reject) => {
    const stream = ytdl.downloadFromInfo(info, { format });
    const writeStream = fs.createWriteStream(outputPath);
    stream.pipe(writeStream);
    writeStream.on('finish', () => resolve(outputPath));
    writeStream.on('error', reject);
    stream.on('error', reject);
    setTimeout(() => reject(new Error('ytdl-core download timeout')), 120000);
  });
}

// Download audio — tries multiple methods
async function downloadAudio(videoId) {
  const errors = [];

  if (await isYtDlpAvailable()) {
    try {
      return await downloadAudioYtDlp(videoId);
    } catch (err) {
      console.log(`[YouTube] yt-dlp download failed: ${err.message}`);
      errors.push(err.message);
    }
  }

  try {
    console.log('[YouTube] Trying youtubei.js audio download...');
    return await downloadAudioInnertube(videoId);
  } catch (err) {
    console.log(`[YouTube] youtubei.js download failed: ${err.message}`);
    errors.push(err.message);
  }

  try {
    console.log('[YouTube] Trying ytdl-core audio download...');
    return await downloadAudioYtdlCore(videoId);
  } catch (err) {
    console.log(`[YouTube] ytdl-core download failed: ${err.message}`);
    errors.push(err.message);
  }

  throw new Error(`Audio download failed: ${errors.join('; ')}`);
}

// ─── AI Transcription Methods ──────────────────────────────────────────────

// Method 3: OpenAI Whisper
async function tryWhisperTranscription(videoId) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey });

  console.log(`[YouTube] Downloading audio for Whisper...`);
  const audioPath = await downloadAudio(videoId);

  try {
    console.log(`[YouTube] Transcribing with Whisper...`);
    const transcription = await client.audio.transcriptions.create({
      model: 'whisper-1',
      file: fs.createReadStream(audioPath),
      response_format: 'text',
    });

    const transcript = typeof transcription === 'string' ? transcription : transcription.text;
    if (!transcript || !transcript.trim()) throw new Error('Empty Whisper result');
    return { transcript: transcript.trim(), method: 'whisper' };
  } finally {
    fs.unlink(audioPath, () => {});
  }
}

// Method 4: AssemblyAI
async function tryAssemblyAITranscription(videoId) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) throw new Error('ASSEMBLYAI_API_KEY not set');

  const { AssemblyAI } = require('assemblyai');
  const client = new AssemblyAI({ apiKey });

  console.log(`[YouTube] Downloading audio for AssemblyAI...`);
  const audioPath = await downloadAudio(videoId);

  try {
    console.log(`[YouTube] Transcribing with AssemblyAI...`);
    const transcript = await client.transcripts.transcribe({ audio: audioPath });

    if (transcript.status === 'error') throw new Error(`AssemblyAI: ${transcript.error}`);

    const text = transcript.text;
    if (!text || !text.trim()) throw new Error('Empty AssemblyAI result');
    return { transcript: text.trim(), method: 'assemblyai' };
  } finally {
    fs.unlink(audioPath, () => {});
  }
}

// ─── Fetch video title ─────────────────────────────────────────────────────

async function fetchVideoTitle(videoId) {
  try {
    const playerData = await fetchPlayerData(videoId);
    if (playerData?.videoDetails?.title) return playerData.videoDetails.title;
  } catch {}

  try {
    const title = await new Promise((resolve, reject) => {
      execFile('yt-dlp', ['--get-title', '--no-download', `https://www.youtube.com/watch?v=${videoId}`], {
        timeout: 15000,
      }, (error, stdout) => {
        if (error || !stdout.trim()) reject(error);
        else resolve(stdout.trim());
      });
    });
    return title;
  } catch {}

  return `YouTube Video (${videoId})`;
}

// ─── Diagnostic endpoint ───────────────────────────────────────────────────

router.get('/status', async (req, res) => {
  const ytDlpAvailable = await isYtDlpAvailable();
  let ytdlCoreAvailable = false;
  let innertubeAvailable = false;
  try { require('@distube/ytdl-core'); ytdlCoreAvailable = true; } catch {}
  try { require('youtubei.js'); innertubeAvailable = true; } catch {}

  res.json({
    methods: {
      direct_captions: { available: true, note: 'Direct YouTube page scraping (no API key needed)' },
      youtube_transcript_lib: { available: true, note: 'youtube-transcript npm package' },
      whisper: {
        available: !!process.env.OPENAI_API_KEY,
        note: process.env.OPENAI_API_KEY ? 'Ready' : 'OPENAI_API_KEY not set',
      },
      assemblyai: {
        available: !!process.env.ASSEMBLYAI_API_KEY,
        note: process.env.ASSEMBLYAI_API_KEY ? 'Ready' : 'ASSEMBLYAI_API_KEY not set',
      },
    },
    audio_download: {
      ytDlp: ytDlpAvailable,
      innertube: innertubeAvailable,
      ytdlCore: ytdlCoreAvailable,
    },
  });
});

// ─── Main transcript endpoint ──────────────────────────────────────────────

router.post('/transcript', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  const videoId = extractVideoId(url);
  if (!videoId) return res.status(400).json({ error: 'Invalid YouTube URL' });

  const errors = [];

  // Method 1: Direct caption extraction (most reliable, no deps)
  try {
    console.log(`[YouTube] Method 1: Direct caption extraction for ${videoId}...`);
    const { transcript, title, method } = await tryDirectCaptions(videoId);
    return res.json({
      videoId,
      title,
      transcript,
      method,
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
    });
  } catch (err) {
    console.log(`[YouTube] Direct captions failed: ${err.message}`);
    errors.push(`Direct captions: ${err.message}`);
  }

  // Method 2: youtube-transcript npm library
  try {
    console.log(`[YouTube] Method 2: youtube-transcript lib for ${videoId}...`);
    const { transcript, method } = await tryYoutubeTranscriptLib(videoId);
    const title = await fetchVideoTitle(videoId);
    return res.json({
      videoId,
      title,
      transcript,
      method,
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
    });
  } catch (err) {
    console.log(`[YouTube] youtube-transcript lib failed: ${err.message}`);
    errors.push(`Caption lib: ${err.message}`);
  }

  // Method 3: OpenAI Whisper (requires API key + audio download)
  try {
    console.log(`[YouTube] Method 3: Whisper for ${videoId}...`);
    const { transcript, method } = await tryWhisperTranscription(videoId);
    const title = await fetchVideoTitle(videoId);
    return res.json({
      videoId,
      title,
      transcript,
      method,
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
    });
  } catch (err) {
    console.log(`[YouTube] Whisper failed: ${err.message}`);
    errors.push(`Whisper: ${err.message}`);
  }

  // Method 4: AssemblyAI (requires API key + audio download)
  try {
    console.log(`[YouTube] Method 4: AssemblyAI for ${videoId}...`);
    const { transcript, method } = await tryAssemblyAITranscription(videoId);
    const title = await fetchVideoTitle(videoId);
    return res.json({
      videoId,
      title,
      transcript,
      method,
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
    });
  } catch (err) {
    console.log(`[YouTube] AssemblyAI failed: ${err.message}`);
    errors.push(`AssemblyAI: ${err.message}`);
  }

  // All methods failed
  console.error(`[YouTube] ALL methods failed for ${videoId}:`, errors);
  res.status(500).json({
    error: 'Failed to get transcript. All methods exhausted.',
    details: errors,
  });
});

module.exports = router;
