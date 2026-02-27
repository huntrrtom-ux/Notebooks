const express = require('express');
const { YoutubeTranscript } = require('youtube-transcript');
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
function isYtDlpAvailable() {
  return new Promise((resolve) => {
    execFile('yt-dlp', ['--version'], { timeout: 5000 }, (error) => {
      resolve(!error);
    });
  });
}

// Fetch video title — tries yt-dlp first, then ytdl-core
async function fetchVideoTitle(videoId) {
  // Try yt-dlp
  try {
    const title = await new Promise((resolve, reject) => {
      execFile('yt-dlp', ['--get-title', '--no-download', `https://www.youtube.com/watch?v=${videoId}`], {
        timeout: 15000,
      }, (error, stdout) => {
        if (error || !stdout.trim()) reject(new Error('yt-dlp title failed'));
        else resolve(stdout.trim());
      });
    });
    return title;
  } catch {}

  // Try youtubei.js
  try {
    const { Innertube } = require('youtubei.js');
    const yt = await Innertube.create();
    const info = await yt.getBasicInfo(videoId);
    if (info.basic_info?.title) return info.basic_info.title;
  } catch {}

  // Try ytdl-core
  try {
    const ytdl = require('@distube/ytdl-core');
    const info = await ytdl.getBasicInfo(`https://www.youtube.com/watch?v=${videoId}`);
    if (info.videoDetails?.title) return info.videoDetails.title;
  } catch {}

  return `YouTube Video (${videoId})`;
}

// Method 1a: youtube-transcript library (captions)
async function tryYoutubeTranscript(videoId) {
  const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
  const transcript = transcriptItems.map(item => item.text).join(' ');
  if (!transcript.trim()) throw new Error('Empty transcript');
  return { transcript, method: 'captions' };
}

// Method 1b: youtubei.js Innertube captions (more reliable)
async function tryInnertubeTranscript(videoId) {
  const { Innertube } = require('youtubei.js');
  const yt = await Innertube.create();
  const info = await yt.getBasicInfo(videoId);
  const transcriptInfo = await info.getTranscript();

  if (!transcriptInfo?.transcript?.content?.body?.initial_segments) {
    throw new Error('No transcript segments found');
  }

  const segments = transcriptInfo.transcript.content.body.initial_segments;
  const transcript = segments
    .map(seg => seg.snippet?.text || '')
    .filter(Boolean)
    .join(' ');

  if (!transcript.trim()) throw new Error('Empty Innertube transcript');
  return { transcript, method: 'captions' };
}

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
      // Find the output file (yt-dlp may adjust extension)
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

// Download audio using youtubei.js (Innertube API, most reliable Node.js option)
async function downloadAudioInnertube(videoId) {
  const { Innertube } = require('youtubei.js');
  const tmpDir = os.tmpdir();
  const outputPath = path.join(tmpDir, `yt-audio-${videoId}-${Date.now()}.webm`);

  const yt = await Innertube.create();
  const info = await yt.getBasicInfo(videoId);
  const format = info.chooseFormat({ type: 'audio', quality: 'best' });

  if (!format) throw new Error('No audio format available via youtubei.js');

  const stream = await info.download({ type: 'audio', quality: 'best' });
  const writeStream = fs.createWriteStream(outputPath);

  for await (const chunk of stream) {
    writeStream.write(chunk);
  }
  writeStream.end();

  return new Promise((resolve, reject) => {
    writeStream.on('finish', () => resolve(outputPath));
    writeStream.on('error', reject);
  });
}

// Download audio — tries multiple methods in order of reliability
async function downloadAudio(videoId) {
  const errors = [];

  // Try yt-dlp first (system binary, most reliable)
  if (await isYtDlpAvailable()) {
    try {
      return await downloadAudioYtDlp(videoId);
    } catch (err) {
      console.log(`[YouTube] yt-dlp download failed: ${err.message}`);
      errors.push(err.message);
    }
  } else {
    console.log('[YouTube] yt-dlp not available on system');
  }

  // Try youtubei.js (Innertube API — most reliable Node.js option)
  try {
    console.log('[YouTube] Trying youtubei.js for audio download...');
    return await downloadAudioInnertube(videoId);
  } catch (err) {
    console.log(`[YouTube] youtubei.js download failed: ${err.message}`);
    errors.push(err.message);
  }

  // Try @distube/ytdl-core as last resort
  try {
    console.log('[YouTube] Trying @distube/ytdl-core for audio download...');
    return await downloadAudioYtdlCore(videoId);
  } catch (err) {
    console.log(`[YouTube] ytdl-core download failed: ${err.message}`);
    errors.push(err.message);
  }

  throw new Error(`All audio download methods failed: ${errors.join('; ')}`);
}

// Method 2: OpenAI Whisper transcription
async function tryWhisperTranscription(videoId) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey });

  console.log(`[YouTube] Downloading audio for ${videoId} (Whisper fallback)...`);
  const audioPath = await downloadAudio(videoId);

  try {
    console.log(`[YouTube] Transcribing with Whisper: ${audioPath}`);
    const transcription = await client.audio.transcriptions.create({
      model: 'whisper-1',
      file: fs.createReadStream(audioPath),
      response_format: 'text',
    });

    const transcript = typeof transcription === 'string' ? transcription : transcription.text;
    if (!transcript || !transcript.trim()) throw new Error('Empty Whisper transcription');
    return { transcript: transcript.trim(), method: 'whisper' };
  } finally {
    fs.unlink(audioPath, () => {});
  }
}

// Method 3: AssemblyAI transcription
async function tryAssemblyAITranscription(videoId) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) throw new Error('ASSEMBLYAI_API_KEY not set');

  const { AssemblyAI } = require('assemblyai');
  const client = new AssemblyAI({ apiKey });

  console.log(`[YouTube] Downloading audio for ${videoId} (AssemblyAI fallback)...`);
  const audioPath = await downloadAudio(videoId);

  try {
    console.log(`[YouTube] Transcribing with AssemblyAI: ${audioPath}`);
    const transcript = await client.transcripts.transcribe({
      audio: audioPath,
    });

    if (transcript.status === 'error') {
      throw new Error(`AssemblyAI error: ${transcript.error}`);
    }

    const text = transcript.text;
    if (!text || !text.trim()) throw new Error('Empty AssemblyAI transcription');
    return { transcript: text.trim(), method: 'assemblyai' };
  } finally {
    fs.unlink(audioPath, () => {});
  }
}

// Diagnostic endpoint — shows what transcript methods are available
router.get('/status', async (req, res) => {
  const ytDlpAvailable = await isYtDlpAvailable();
  let ytdlCoreAvailable = false;
  let innertubeAvailable = false;
  try { require('@distube/ytdl-core'); ytdlCoreAvailable = true; } catch {}
  try { require('youtubei.js'); innertubeAvailable = true; } catch {}

  const audioMethod = ytDlpAvailable ? 'yt-dlp' : (innertubeAvailable ? 'youtubei.js' : (ytdlCoreAvailable ? 'ytdl-core' : 'none'));

  res.json({
    methods: {
      captions_lib: { available: true, note: 'youtube-transcript npm library' },
      captions_innertube: { available: innertubeAvailable, note: 'youtubei.js Innertube API' },
      whisper: {
        available: !!process.env.OPENAI_API_KEY,
        audioDownload: audioMethod,
        note: process.env.OPENAI_API_KEY ? 'OpenAI Whisper ready' : 'OPENAI_API_KEY not set',
      },
      assemblyai: {
        available: !!process.env.ASSEMBLYAI_API_KEY,
        audioDownload: audioMethod,
        note: process.env.ASSEMBLYAI_API_KEY ? 'AssemblyAI ready' : 'ASSEMBLYAI_API_KEY not set',
      },
    },
    system: {
      ytDlp: ytDlpAvailable,
      innertube: innertubeAvailable,
      ytdlCore: ytdlCoreAvailable,
    },
  });
});

// Fetch transcript for a YouTube video with fallback chain
router.post('/transcript', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  const videoId = extractVideoId(url);
  if (!videoId) return res.status(400).json({ error: 'Invalid YouTube URL' });

  const errors = [];

  // Method 1a: Try youtube-transcript library (captions) — fast and free
  try {
    console.log(`[YouTube] Trying youtube-transcript library for ${videoId}...`);
    const { transcript, method } = await tryYoutubeTranscript(videoId);
    const title = await fetchVideoTitle(videoId);
    return res.json({
      videoId,
      title,
      transcript,
      method,
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
    });
  } catch (err) {
    console.log(`[YouTube] youtube-transcript failed: ${err.message}`);
    errors.push(`Captions (lib): ${err.message}`);
  }

  // Method 1b: Try youtubei.js Innertube captions (more reliable)
  try {
    console.log(`[YouTube] Trying youtubei.js captions for ${videoId}...`);
    const { transcript, method } = await tryInnertubeTranscript(videoId);
    const title = await fetchVideoTitle(videoId);
    return res.json({
      videoId,
      title,
      transcript,
      method,
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
    });
  } catch (err) {
    console.log(`[YouTube] youtubei.js captions failed: ${err.message}`);
    errors.push(`Captions (innertube): ${err.message}`);
  }

  // Method 2: Try OpenAI Whisper
  try {
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

  // Method 3: Try AssemblyAI
  try {
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
  console.error(`[YouTube] All transcript methods failed for ${videoId}:`, errors);
  res.status(500).json({
    error: 'Failed to get transcript. All methods exhausted.',
    details: errors,
  });
});

module.exports = router;
