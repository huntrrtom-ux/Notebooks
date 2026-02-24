import { useState } from 'react';
import { useDrag, useResize } from '../hooks/useDrag';

export default function GroupCard({
  item, items, locked, selected, linking,
  onUpdate, onUpdateChild, onDelete, onSelect, onStartLink, onCompleteLink, zoom
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);

  const { dragging, handleDragStart } = useDrag({
    x: item.x, y: item.y, zoom, locked,
    onUpdate: (pos) => {
      // Move the group and all its children
      const dx = pos.x - item.x;
      const dy = pos.y - item.y;
      onUpdate(pos);
      const children = items.filter(i => i.group_id === item.id);
      children.forEach(child => {
        onUpdateChild(child.id, { x: child.x + dx, y: child.y + dy });
      });
    },
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

  const saveTitle = () => {
    if (editTitle.trim() !== item.title) {
      onUpdate({ title: editTitle.trim() });
    }
    setEditing(false);
  };

  const childItems = items.filter(i => i.group_id === item.id);

  return (
    <div
      className={`canvas-card group-card ${dragging ? 'dragging' : ''} ${selected ? 'selected' : ''} ${linking ? 'linking' : ''}`}
      style={{
        left: item.x,
        top: item.y,
        width: item.width,
        height: item.height,
        zIndex: dragging ? 500 : 1,
      }}
      onClick={handleClick}
      onMouseDown={(e) => {
        if (e.target.tagName === 'INPUT') return;
        handleDragStart(e);
      }}
    >
      <div className="group-header">
        {editing ? (
          <input
            className="input"
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={e => e.key === 'Enter' && saveTitle()}
            onClick={e => e.stopPropagation()}
            autoFocus
            style={{ flex: 1, padding: '4px 8px', fontSize: '0.9rem' }}
          />
        ) : (
          <span
            className="group-title"
            onDoubleClick={() => { if (!locked) { setEditing(true); setEditTitle(item.title); } }}
          >
            🗂️ {item.title || 'Untitled Group'}
          </span>
        )}
        <div style={{ display: 'flex', gap: 2 }}>
          <button className="btn-icon" onClick={(e) => { e.stopPropagation(); onStartLink(); }}
            title="Link to chat" style={{ width: 28, height: 28, fontSize: '0.85rem' }}>🔗</button>
          {!locked && (
            <button className="btn-icon" onClick={(e) => { e.stopPropagation(); onDelete(); }}
              title="Delete group" style={{ width: 28, height: 28, fontSize: '0.85rem', color: 'var(--danger)' }}>✕</button>
          )}
        </div>
      </div>
      <div className="group-body">
        {childItems.length === 0 ? (
          <p style={{ fontStyle: 'italic' }}>Drag items here or right-click to add to this group</p>
        ) : (
          <p>{childItems.length} item{childItems.length !== 1 ? 's' : ''} in group</p>
        )}
      </div>
      <div className="resize-handle" onMouseDown={handleResizeStart} />
    </div>
  );
}
