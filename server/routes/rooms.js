const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const router = express.Router();

// Get all rooms
router.get('/', (req, res) => {
  const rooms = db.prepare('SELECT * FROM rooms ORDER BY updated_at DESC').all();
  res.json(rooms);
});

// Create a room
router.post('/', (req, res) => {
  const { name } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO rooms (id, name) VALUES (?, ?)').run(id, name || 'Untitled Room');
  db.prepare('INSERT INTO canvas_state (room_id) VALUES (?)').run(id);
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(id);
  res.status(201).json(room);
});

// Update a room
router.patch('/:id', (req, res) => {
  const { name } = req.body;
  db.prepare("UPDATE rooms SET name = ?, updated_at = datetime('now') WHERE id = ?").run(name, req.params.id);
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json(room);
});

// Delete a room
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM rooms WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Room not found' });
  res.json({ success: true });
});

// Get canvas state
router.get('/:id/canvas', (req, res) => {
  let state = db.prepare('SELECT * FROM canvas_state WHERE room_id = ?').get(req.params.id);
  if (!state) {
    db.prepare('INSERT INTO canvas_state (room_id) VALUES (?)').run(req.params.id);
    state = db.prepare('SELECT * FROM canvas_state WHERE room_id = ?').get(req.params.id);
  }
  res.json(state);
});

// Update canvas state
router.patch('/:id/canvas', (req, res) => {
  const { zoom, pan_x, pan_y, locked } = req.body;
  const state = db.prepare('SELECT * FROM canvas_state WHERE room_id = ?').get(req.params.id);
  if (!state) {
    db.prepare('INSERT INTO canvas_state (room_id, zoom, pan_x, pan_y, locked) VALUES (?, ?, ?, ?, ?)').run(
      req.params.id, zoom ?? 1, pan_x ?? 0, pan_y ?? 0, locked ?? 0
    );
  } else {
    db.prepare('UPDATE canvas_state SET zoom = ?, pan_x = ?, pan_y = ?, locked = ? WHERE room_id = ?').run(
      zoom ?? state.zoom, pan_x ?? state.pan_x, pan_y ?? state.pan_y, locked ?? state.locked, req.params.id
    );
  }
  const updated = db.prepare('SELECT * FROM canvas_state WHERE room_id = ?').get(req.params.id);
  res.json(updated);
});

module.exports = router;
