const express = require('express');
const { YoutubeTranscript } = require('youtube-transcript');

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

// Fetch transcript for a YouTube video
router.post('/transcript', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  const videoId = extractVideoId(url);
  if (!videoId) return res.status(400).json({ error: 'Invalid YouTube URL' });

  try {
    const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
    const transcript = transcriptItems.map(item => item.text).join(' ');
    const title = `YouTube Video (${videoId})`;

    res.json({
      videoId,
      title,
      transcript,
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
    });
  } catch (error) {
    console.error('YouTube transcript error:', error);
    res.status(500).json({ error: 'Failed to fetch transcript. The video may not have captions available.' });
  }
});

module.exports = router;
