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

// Fetch video title using yt-dlp
function fetchVideoTitle(videoId) {
  return new Promise((resolve) => {
    execFile('yt-dlp', ['--get-title', '--no-download', `https://www.youtube.com/watch?v=${videoId}`], {
      timeout: 15000,
    }, (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve(`YouTube Video (${videoId})`);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

// Method 1: youtube-transcript (captions)
async function tryYoutubeTranscript(videoId) {
  const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
  const transcript = transcriptItems.map(item => item.text).join(' ');
  if (!transcript.trim()) throw new Error('Empty transcript');
  return { transcript, method: 'captions' };
}

// Download audio using yt-dlp to a temp file
function downloadAudio(videoId) {
  return new Promise((resolve, reject) => {
    const tmpDir = os.tmpdir();
    const outputPath = path.join(tmpDir, `yt-audio-${videoId}-${Date.now()}.mp3`);

    execFile('yt-dlp', [
      '-x',                              // Extract audio
      '--audio-format', 'mp3',           // Convert to mp3
      '--audio-quality', '5',            // Medium quality (smaller file)
      '-o', outputPath,                  // Output path
      '--no-playlist',                   // Single video only
      '--max-filesize', '25m',           // Whisper API limit
      `https://www.youtube.com/watch?v=${videoId}`,
    ], {
      timeout: 120000,                   // 2 min timeout for download
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`yt-dlp failed: ${stderr || error.message}`));
        return;
      }
      // yt-dlp may adjust the extension, find the actual file
      const possiblePaths = [outputPath, outputPath.replace('.mp3', '.mp3')];
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          resolve(p);
          return;
        }
      }
      // Check for files matching the pattern in tmpDir
      const files = fs.readdirSync(tmpDir).filter(f => f.startsWith(`yt-audio-${videoId}`));
      if (files.length > 0) {
        resolve(path.join(tmpDir, files[files.length - 1]));
      } else {
        reject(new Error('Audio file not found after download'));
      }
    });
  });
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
    // Clean up temp file
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
