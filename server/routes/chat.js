const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Anthropic = require('@anthropic-ai/sdk');
const db = require('../db');

const router = express.Router();

// Get messages for a chat item in a room
router.get('/:roomId/messages/:chatItemId', (req, res) => {
  const messages = db.prepare(
    'SELECT * FROM messages WHERE room_id = ? AND chat_item_id = ? ORDER BY created_at ASC'
  ).all(req.params.roomId, req.params.chatItemId);
  res.json(messages);
});

// Send a message and get Claude's response (streaming)
router.post('/:roomId/chat/:chatItemId', async (req, res) => {
  const { message, linked_item_ids } = req.body;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  // Save user message
  const userMsgId = uuidv4();
  db.prepare('INSERT INTO messages (id, room_id, chat_item_id, role, content) VALUES (?, ?, ?, ?, ?)').run(
    userMsgId, req.params.roomId, req.params.chatItemId, 'user', message
  );

  // Gather context from linked items
  let contextParts = [];
  if (linked_item_ids && linked_item_ids.length > 0) {
    const placeholders = linked_item_ids.map(() => '?').join(',');
    const linkedItems = db.prepare(
      `SELECT * FROM items WHERE id IN (${placeholders}) AND room_id = ?`
    ).all(...linked_item_ids, req.params.roomId);

    for (const item of linkedItems) {
      const meta = JSON.parse(item.meta || '{}');
      let contextText = '';
      if (item.type === 'youtube') {
        contextText = `[YouTube Video: ${item.title}]\nTranscript:\n${item.content}`;
      } else if (item.type === 'document') {
        contextText = `[Document: ${item.title}]\nContent:\n${item.content}`;
      } else if (item.type === 'note') {
        contextText = `[Note: ${item.title}]\n${item.content}`;
      } else if (item.type === 'sticky') {
        contextText = `[Sticky Note]\n${item.content}`;
      } else if (item.type === 'group') {
        // Get items in this group
        const groupItems = db.prepare('SELECT * FROM items WHERE group_id = ?').all(item.id);
        const groupContent = groupItems.map(gi => `- ${gi.title}: ${gi.content?.substring(0, 200)}...`).join('\n');
        contextText = `[Group: ${item.title}]\nContains:\n${groupContent}`;
      }
      if (contextText) contextParts.push(contextText);
    }
  }

  // Build conversation history for this specific chat
  const history = db.prepare(
    'SELECT role, content FROM messages WHERE room_id = ? AND chat_item_id = ? ORDER BY created_at ASC'
  ).all(req.params.roomId, req.params.chatItemId);

  const systemMessage = `You are a helpful assistant in a notebook workspace. The user has a canvas where they collect notes, YouTube video transcripts, documents, and sticky notes. Help them understand and work with their content.${
    contextParts.length > 0
      ? '\n\nThe following items are linked to this conversation for context:\n\n' + contextParts.join('\n\n---\n\n')
      : ''
  }`;

  const messages = history.map(m => ({ role: m.role, content: m.content }));

  try {
    const client = new Anthropic({ apiKey });

    // Set up SSE streaming
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    let fullResponse = '';

    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: systemMessage,
      messages,
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5,
        },
      ],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          fullResponse += event.delta.text;
          res.write(`data: ${JSON.stringify({ type: 'text', text: event.delta.text })}\n\n`);
        }
      }
    }

    // Save assistant message
    const assistantMsgId = uuidv4();
    db.prepare('INSERT INTO messages (id, room_id, chat_item_id, role, content) VALUES (?, ?, ?, ?, ?)').run(
      assistantMsgId, req.params.roomId, req.params.chatItemId, 'assistant', fullResponse
    );

    res.write(`data: ${JSON.stringify({ type: 'done', id: assistantMsgId })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Chat error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
      res.end();
    }
  }
});

// Delete all messages for a chat
router.delete('/:roomId/messages/:chatItemId', (req, res) => {
  db.prepare('DELETE FROM messages WHERE room_id = ? AND chat_item_id = ?').run(req.params.roomId, req.params.chatItemId);
  res.json({ success: true });
});

module.exports = router;
