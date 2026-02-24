const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const router = express.Router();

// Get all items for a room
router.get('/:roomId/items', (req, res) => {
  const items = db.prepare('SELECT * FROM items WHERE room_id = ? ORDER BY created_at ASC').all(req.params.roomId);
  const parsed = items.map(item => ({
    ...item,
    meta: JSON.parse(item.meta || '{}'),
  }));
  res.json(parsed);
});

// Create an item
router.post('/:roomId/items', (req, res) => {
  const { type, title, content, x, y, width, height, group_id, pinned_to, color, meta } = req.body;
  const id = uuidv4();
  db.prepare(`
    INSERT INTO items (id, room_id, type, title, content, x, y, width, height, group_id, pinned_to, color, meta)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, req.params.roomId, type,
    title || '', content || '',
    x ?? 100, y ?? 100,
    width ?? 300, height ?? 200,
    group_id || null, pinned_to || null,
    color || '', JSON.stringify(meta || {})
  );
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  res.status(201).json({ ...item, meta: JSON.parse(item.meta || '{}') });
});

// Update an item
router.patch('/:roomId/items/:itemId', (req, res) => {
  const existing = db.prepare('SELECT * FROM items WHERE id = ? AND room_id = ?').get(req.params.itemId, req.params.roomId);
  if (!existing) return res.status(404).json({ error: 'Item not found' });

  const fields = ['title', 'content', 'x', 'y', 'width', 'height', 'group_id', 'pinned_to', 'color', 'meta', 'type'];
  const updates = [];
  const values = [];

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(field === 'meta' ? JSON.stringify(req.body[field]) : req.body[field]);
    }
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(req.params.itemId, req.params.roomId);
    db.prepare(`UPDATE items SET ${updates.join(', ')} WHERE id = ? AND room_id = ?`).run(...values);
  }

  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.itemId);
  res.json({ ...item, meta: JSON.parse(item.meta || '{}') });
});

// Delete an item
router.delete('/:roomId/items/:itemId', (req, res) => {
  // Also remove any links referencing this item
  db.prepare('DELETE FROM links WHERE from_item_id = ? OR to_item_id = ?').run(req.params.itemId, req.params.itemId);
  // Unpin any stickies pinned to this item
  db.prepare('UPDATE items SET pinned_to = NULL WHERE pinned_to = ?').run(req.params.itemId);
  // Remove items in this group if it's a group
  db.prepare('UPDATE items SET group_id = NULL WHERE group_id = ?').run(req.params.itemId);
  const result = db.prepare('DELETE FROM items WHERE id = ? AND room_id = ?').run(req.params.itemId, req.params.roomId);
  if (result.changes === 0) return res.status(404).json({ error: 'Item not found' });
  res.json({ success: true });
});

// --- Links ---

// Get all links for a room
router.get('/:roomId/links', (req, res) => {
  const links = db.prepare('SELECT * FROM links WHERE room_id = ?').all(req.params.roomId);
  res.json(links);
});

// Create a link
router.post('/:roomId/links', (req, res) => {
  const { from_item_id, to_item_id } = req.body;
  // Check duplicate
  const existing = db.prepare('SELECT * FROM links WHERE room_id = ? AND from_item_id = ? AND to_item_id = ?')
    .get(req.params.roomId, from_item_id, to_item_id);
  if (existing) return res.json(existing);

  const id = uuidv4();
  db.prepare('INSERT INTO links (id, room_id, from_item_id, to_item_id) VALUES (?, ?, ?, ?)').run(
    id, req.params.roomId, from_item_id, to_item_id
  );
  const link = db.prepare('SELECT * FROM links WHERE id = ?').get(id);
  res.status(201).json(link);
});

// Delete a link
router.delete('/:roomId/links/:linkId', (req, res) => {
  const result = db.prepare('DELETE FROM links WHERE id = ? AND room_id = ?').run(req.params.linkId, req.params.roomId);
  if (result.changes === 0) return res.status(404).json({ error: 'Link not found' });
  res.json({ success: true });
});

module.exports = router;
