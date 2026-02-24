import { useState } from 'react';
import { useDrag, useResize } from '../hooks/useDrag';

const STICKY_COLORS = ['yellow', 'pink', 'blue', 'green'];

export default function StickyNote({
  item, locked, selected, linking,
  onUpdate, onDelete, onSelect, onStartLink, onCompleteLink, zoom
}) {
  const [content, setContent] = useState(item.content);

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
    if (linking) { onCompleteLink(); return; }
    onSelect();
  };

  const saveContent = () => {
    if (content !== item.content) {
      onUpdate({ content });
    }
  };

  const cycleColor = () => {
    if (locked) return;
    const idx = STICKY_COLORS.indexOf(item.color || 'yellow');
    const next = STICKY_COLORS[(idx + 1) % STICKY_COLORS.length];
    onUpdate({ color: next });
  };

  return (
    <div
      className={`canvas-card sticky-note ${item.color || 'yellow'} ${dragging ? 'dragging' : ''} ${selected ? 'selected' : ''} ${linking ? 'linking' : ''}`}
      style={{
        left: item.x,
        top: item.y,
        width: item.width,
        height: item.height,
        zIndex: dragging ? 500 : (selected ? 100 : 5),
      }}
      onClick={handleClick}
      onMouseDown={(e) => {
        if (e.target.tagName === 'TEXTAREA') return;
        handleDragStart(e);
      }}
    >
      <div className="sticky-actions">
        <button className="btn-icon" onClick={(e) => { e.stopPropagation(); cycleColor(); }}
          title="Change color" style={{ width: 24, height: 24, fontSize: '0.7rem' }}>🎨</button>
        <button className="btn-icon" onClick={(e) => { e.stopPropagation(); onStartLink(); }}
          title="Link" style={{ width: 24, height: 24, fontSize: '0.7rem' }}>🔗</button>
        {!locked && (
          <button className="btn-icon" onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Delete" style={{ width: 24, height: 24, fontSize: '0.7rem', color: 'var(--danger)' }}>✕</button>
        )}
      </div>
      <div className="sticky-body">
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          onBlur={saveContent}
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          placeholder="Sticky note..."
          readOnly={locked}
        />
      </div>
      <div className="resize-handle" onMouseDown={handleResizeStart} />
    </div>
  );
}
