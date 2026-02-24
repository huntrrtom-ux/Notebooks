export default function LinkLines({ items, links, linking, zoom, pan, onDeleteLink }) {
  // Get center point of an item
  const getItemCenter = (itemId) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return null;
    return {
      x: item.x + (item.width || 300) / 2,
      y: item.y + (item.height || 200) / 2,
    };
  };

  return (
    <svg
      className="link-lines-overlay"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      {/* Existing links */}
      {links.map(link => {
        const from = getItemCenter(link.from_item_id);
        const to = getItemCenter(link.to_item_id);
        if (!from || !to) return null;

        // Calculate curve control point
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const offset = Math.min(Math.sqrt(dx * dx + dy * dy) * 0.15, 50);
        const cpX = midX - dy * 0.1;
        const cpY = midY + dx * 0.1;

        return (
          <g key={link.id}>
            <path
              d={`M ${from.x} ${from.y} Q ${cpX} ${cpY} ${to.x} ${to.y}`}
              className="link-line"
              style={{ pointerEvents: 'stroke', cursor: 'pointer', strokeWidth: 3 / zoom }}
              onClick={(e) => {
                e.stopPropagation();
                if (confirm('Remove this link?')) onDeleteLink(link.id);
              }}
            />
            {/* Small circle at midpoint */}
            <circle
              cx={midX}
              cy={midY}
              r={4 / zoom}
              fill="var(--link-line)"
              opacity="0.5"
              style={{ pointerEvents: 'none' }}
            />
          </g>
        );
      })}

      {/* Active linking line */}
      {linking && linking.mousePos && (() => {
        const from = getItemCenter(linking.fromId);
        if (!from) return null;
        // Convert mouse screen coords to canvas coords
        const toX = (linking.mousePos.x - pan.x) / zoom;
        const toY = (linking.mousePos.y - pan.y) / zoom;
        return (
          <line
            x1={from.x}
            y1={from.y}
            x2={toX}
            y2={toY}
            className="link-line-active"
            style={{ strokeWidth: 2 / zoom }}
          />
        );
      })()}

      {/* Pin lines for sticky notes */}
      {items.filter(i => i.pinned_to).map(sticky => {
        const from = getItemCenter(sticky.id);
        const to = getItemCenter(sticky.pinned_to);
        if (!from || !to) return null;
        return (
          <line
            key={`pin-${sticky.id}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            className="pin-line"
            style={{ strokeWidth: 1 / zoom }}
          />
        );
      })}
    </svg>
  );
}
