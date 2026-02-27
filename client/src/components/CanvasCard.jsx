import { useState, useRef } from 'react';
import { useDrag, useResize } from '../hooks/useDrag';
import { api } from '../hooks/useApi';

export default function CanvasCard({
  item, roomId, locked, selected, linking,
  onUpdate, onDelete, onSelect, onStartLink, onCompleteLink, zoom
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [editContent, setEditContent] = useState(item.content);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const titleRef = useRef(null);

  const { dragging, handleDragStart } = useDrag({
    x: item.x, y: item.y, zoom, locked,
    onUpdate: (pos) => onUpdate(pos),
  });

  const { handleResizeStart } = useResize({
    width: item.width, height: item.height, zoom, locked,
    onUpdate: (size) => onUpdate(size),
  });

  const handleClick = (e) => {
    e.stopPropagation();
    if (linking) {
      onCompleteLink();
      return;
    }
    onSelect();
  };

  const saveTitle = () => {
    if (editTitle.trim() !== item.title) {
      onUpdate({ title: editTitle.trim() });
    }
    setEditing(false);
  };

  const saveContent = () => {
    if (editContent !== item.content) {
      onUpdate({ content: editContent });
    }
  };

  const fetchYoutubeTranscript = async () => {
    if (!youtubeUrl.trim()) return;
    setYoutubeLoading(true);
    try {
      const result = await api.fetchTranscript(youtubeUrl.trim());
      onUpdate({
        title: result.title,
        content: result.transcript,
        meta: { videoId: result.videoId, thumbnailUrl: result.thumbnailUrl, url: youtubeUrl.trim(), method: result.method },
      });
      setYoutubeUrl('');
    } catch (err) {
      let msg = 'Failed to fetch transcript: ' + err.message;
      if (err.details && err.details.length > 0) {
        msg += '\n\nDetails:\n' + err.details.map(d => '• ' + d).join('\n');
      }
      alert(msg);
    } finally {
      setYoutubeLoading(false);
    }
  };

  const typeBadges = {
    note: 'NOTE',
    youtube: 'YOUTUBE',
    document: 'DOC',
  };

  const isYoutubeEmpty = item.type === 'youtube' && !item.content && !item.meta?.videoId;

  return (
    <div
      className={`canvas-card ${item.type}-card ${dragging ? 'dragging' : ''} ${selected ? 'selected' : ''} ${linking ? 'linking' : ''}`}
      style={{
        left: item.x,
        top: item.y,
        width: item.width,
        height: item.height,
        zIndex: dragging ? 500 : (selected ? 100 : 10),
      }}
      onClick={handleClick}
      onMouseDown={(e) => {
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
        handleDragStart(e);
      }}
    >
      <div className="card-header">
        <span className="card-type-badge">{typeBadges[item.type] || 'ITEM'}</span>
        {editing ? (
          <input
            ref={titleRef}
            className="input"
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={e => e.key === 'Enter' && saveTitle()}
            onClick={e => e.stopPropagation()}
            autoFocus
            style={{ flex: 1, padding: '4px 8px', fontSize: '0.85rem' }}
          />
        ) : (
          <span
            className="card-title"
            onDoubleClick={() => { if (!locked) { setEditing(true); setEditTitle(item.title); } }}
          >
            {item.title || 'Untitled'}
          </span>
        )}
        <div className="card-actions">
          <button className="btn-icon" onClick={(e) => { e.stopPropagation(); onStartLink(); }} title="Link to chat">🔗</button>
          {!locked && (
            <button className="btn-icon" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete"
              style={{ color: 'var(--danger)' }}>✕</button>
          )}
        </div>
      </div>

      <div className="card-body">
        {item.type === 'youtube' && isYoutubeEmpty ? (
          <div className="youtube-input-form">
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 4 }}>
              Paste a YouTube URL to fetch its transcript (auto-detects captions, falls back to AI transcription)
            </p>
            <input
              className="input"
              placeholder="https://youtube.com/watch?v=..."
              value={youtubeUrl}
              onChange={e => setYoutubeUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchYoutubeTranscript()}
              onClick={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={(e) => { e.stopPropagation(); fetchYoutubeTranscript(); }}
              disabled={youtubeLoading}
            >
              {youtubeLoading ? 'Transcribing…' : 'Fetch Transcript'}
            </button>
          </div>
        ) : item.type === 'youtube' ? (
          <>
            {item.meta?.thumbnailUrl && (
              <div style={{ position: 'relative' }}>
                <img
                  className="thumbnail"
                  src={item.meta.thumbnailUrl}
                  alt={item.title}
                  draggable={false}
                />
                {item.meta?.method && item.meta.method !== 'captions' && (
                  <span style={{
                    position: 'absolute', top: 4, right: 4,
                    background: 'rgba(0,0,0,0.7)', color: '#fff',
                    fontSize: '0.65rem', padding: '2px 6px', borderRadius: 4,
                    textTransform: 'uppercase', letterSpacing: '0.5px',
                  }}>
                    {item.meta.method === 'whisper' ? 'AI Transcribed (Whisper)' : 'AI Transcribed (AssemblyAI)'}
                  </span>
                )}
              </div>
            )}
            <div className="transcript-preview">{item.content}</div>
          </>
        ) : (
          <textarea
            value={editContent}
            onChange={e => { setEditContent(e.target.value); }}
            onBlur={saveContent}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            placeholder={item.type === 'note' ? 'Write your note here...' : 'Document content...'}
            readOnly={locked}
            style={item.type === 'document' ? { fontFamily: "'SF Mono', 'Fira Code', monospace", fontSize: '0.82rem' } : {}}
          />
        )}
      </div>

      <div className="resize-handle" onMouseDown={handleResizeStart} />
    </div>
  );
}
