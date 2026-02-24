import { useState, useEffect, useRef } from 'react';
import { useDrag, useResize } from '../hooks/useDrag';
import { api } from '../hooks/useApi';

export default function ChatWindow({
  item, roomId, locked, selected, linking, linkedItemIds,
  onUpdate, onDelete, onSelect, onStartLink, onCompleteLink, zoom
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const { dragging, handleDragStart } = useDrag({
    x: item.x, y: item.y, zoom, locked: false, // Chat can always be moved
    onUpdate: (pos) => onUpdate({ ...pos, _forceLocked: true }),
  });

  const { handleResizeStart } = useResize({
    width: item.width, height: item.height, zoom, locked: false,
    onUpdate: (size) => onUpdate({ ...size, _forceLocked: true }),
  });

  // Load messages
  useEffect(() => {
    api.getMessages(roomId, item.id).then(setMessages).catch(console.error);
  }, [roomId, item.id]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamText]);

  const handleClick = (e) => {
    e.stopPropagation();
    if (linking) { onCompleteLink(); return; }
    onSelect();
  };

  const sendMessage = async () => {
    if (!input.trim() || streaming) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: userMsg }]);
    setStreaming(true);
    setStreamText('');

    try {
      const response = await fetch(`/api/rooms/${roomId}/chat/${item.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          linked_item_ids: linkedItemIds,
        }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let full = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'text') {
                full += data.text;
                setStreamText(full);
              } else if (data.type === 'done') {
                setMessages(prev => [...prev, { id: data.id, role: 'assistant', content: full }]);
                setStreamText('');
              } else if (data.type === 'error') {
                setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: `Error: ${data.error}` }]);
                setStreamText('');
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: `Error: ${err.message}` }]);
      setStreamText('');
    } finally {
      setStreaming(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = async () => {
    if (!confirm('Clear all messages in this chat?')) return;
    await api.clearMessages(roomId, item.id);
    setMessages([]);
  };

  return (
    <div
      className={`chat-window ${dragging ? 'dragging' : ''} ${selected ? 'selected' : ''} ${linking ? 'linking' : ''}`}
      style={{
        left: item.x,
        top: item.y,
        width: item.width,
        height: item.height,
        zIndex: dragging ? 600 : (selected ? 200 : 50),
      }}
      onClick={handleClick}
    >
      <div
        className="chat-header"
        onMouseDown={(e) => { if (e.target.tagName !== 'BUTTON') handleDragStart(e); }}
      >
        <div className="chat-title">
          💬 Claude Chat
          {linkedItemIds.length > 0 && (
            <span className="chat-linked-count">{linkedItemIds.length} linked</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          <button className="btn-icon" onClick={(e) => { e.stopPropagation(); onStartLink(); }}
            title="Link items to this chat" style={{ width: 28, height: 28, fontSize: '0.85rem' }}>🔗</button>
          <button className="btn-icon" onClick={(e) => { e.stopPropagation(); clearChat(); }}
            title="Clear chat" style={{ width: 28, height: 28, fontSize: '0.85rem' }}>🗑️</button>
          {!locked && (
            <button className="btn-icon" onClick={(e) => { e.stopPropagation(); onDelete(); }}
              title="Remove chat" style={{ width: 28, height: 28, fontSize: '0.85rem', color: 'var(--danger)' }}>✕</button>
          )}
        </div>
      </div>

      <div className="chat-messages" onMouseDown={e => e.stopPropagation()}>
        {messages.length === 0 && !streamText && (
          <div className="chat-empty">
            <div>
              <p style={{ fontSize: '1.5rem', marginBottom: 8 }}>💬</p>
              <p>Start a conversation with Claude.</p>
              <p style={{ fontSize: '0.8rem', marginTop: 8, color: 'var(--text-muted)' }}>
                Link cards to this chat using 🔗 to give Claude context about your content.
              </p>
            </div>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`chat-message ${msg.role}`}>
            {msg.content}
          </div>
        ))}
        {streamText && (
          <div className="chat-message assistant">
            {streamText}
            <span className="loading-dots" style={{ marginLeft: 6 }}>
              <span></span><span></span><span></span>
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area" onMouseDown={e => e.stopPropagation()}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onClick={e => e.stopPropagation()}
          placeholder="Message Claude... (Enter to send, Shift+Enter for newline)"
          rows={2}
          disabled={streaming}
        />
        <button
          className="btn btn-primary"
          onClick={sendMessage}
          disabled={streaming || !input.trim()}
        >
          {streaming ? '...' : '→'}
        </button>
      </div>

      <div className="resize-handle" onMouseDown={handleResizeStart} />
    </div>
  );
}
