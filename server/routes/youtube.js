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

  // Try ytdl-core
  try {
    const ytdl = require('@distube/ytdl-core');
    const info = await ytdl.getBasicInfo(`https://www.youtube.com/watch?v=${videoId}`);
    if (info.videoDetails?.title) return info.videoDetails.title;
  } catch {}

  return `YouTube Video (${videoId})`;
}

// Method 1: youtube-transcript (captions)
async function tryYoutubeTranscript(videoId) {
  const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
  const transcript = transcriptItems.map(item => item.text).join(' ');
  if (!transcript.trim()) throw new Error('Empty transcript');
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

// Download audio using @distube/ytdl-core (pure Node.js fallback)
async function downloadAudioYtdlCore(videoId) {
  const ytdl = require('@distube/ytdl-core');
  const tmpDir = os.tmpdir();
  const outputPath = path.join(tmpDir, `yt-audio-${videoId}-${Date.now()}.webm`);

  const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${videoId}`);
  const format = ytdl.chooseFormat(info.formats, { quality: 'lowestaudio', filter: 'audioonly' });

  if (!format) throw new Error('No audio format available');

  return new Promise((resolve, reject) => {
    const stream = ytdl.downloadFromInfo(info, { format });
    const writeStream = fs.createWriteStream(outputPath);
    stream.pipe(writeStream);
    writeStream.on('finish', () => resolve(outputPath));
    writeStream.on('error', reject);
    stream.on('error', reject);
    // Timeout after 2 minutes
    setTimeout(() => reject(new Error('ytdl-core download timeout')), 120000);
  });
}

// Download audio — tries yt-dlp first, then ytdl-core
async function downloadAudio(videoId) {
  // Try yt-dlp first (better quality, more reliable)
  if (await isYtDlpAvailable()) {
    try {
      return await downloadAudioYtDlp(videoId);
    } catch (err) {
      console.log(`[YouTube] yt-dlp download failed, trying ytdl-core: ${err.message}`);
    }
  } else {
    console.log('[YouTube] yt-dlp not available, using ytdl-core');
  }

  // Fallback to ytdl-core (pure Node.js)
  return await downloadAudioYtdlCore(videoId);
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

// Fetch transcript for a YouTube video with fallback chain
router.post('/transcript', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  const videoId = extractVideoId(url);
  if (!videoId) return res.status(400).json({ error: 'Invalid YouTube URL' });

  const errors = [];

  // Method 1: Try youtube-transcript (captions) — fast and free
  try {
    console.log(`[YouTube] Trying captions for ${videoId}...`);
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
    console.log(`[YouTube] Captions failed: ${err.message}`);
    errors.push(`Captions: ${err.message}`);
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
    error: 'Failed to get transcript. Tried: captions, Whisper, AssemblyAI.',
    details: errors,
  });
});

module.exports = router;
