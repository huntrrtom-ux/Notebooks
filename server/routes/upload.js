const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'text/plain', 'text/markdown', 'text/csv', 'text/html',
      'application/json', 'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    const allowedExts = ['.txt', '.md', '.csv', '.html', '.json', '.pdf', '.docx', '.js', '.ts', '.py', '.java', '.c', '.cpp', '.rs'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('File type not supported. Please upload text-based files.'));
    }
  },
});

router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const filePath = req.file.path;
    const content = fs.readFileSync(filePath, 'utf-8');

    res.json({
      filename: req.file.originalname,
      content,
      size: req.file.size,
    });

    // Clean up the uploaded file after reading
    fs.unlinkSync(filePath);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to process uploaded file' });
  }
});

module.exports = router;
