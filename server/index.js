const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// API routes
app.use('/api/rooms', require('./routes/rooms'));
app.use('/api/rooms', require('./routes/items'));
app.use('/api/rooms', require('./routes/chat'));
app.use('/api/youtube', require('./routes/youtube'));
app.use('/api/upload', require('./routes/upload'));

// Serve static files from React build
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
