import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../hooks/useApi';
import { useTheme } from '../contexts/ThemeContext';
import Toolbar from './Toolbar';
import CanvasCard from './CanvasCard';
import ChatWindow from './ChatWindow';
import StickyNote from './StickyNote';
import GroupCard from './GroupCard';
import LinkLines from './LinkLines';
import ContextMenu from './ContextMenu';

export default function NotebookCanvas() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { dark, toggleTheme } = useTheme();

  const [room, setRoom] = useState(null);
  const [items, setItems] = useState([]);
  const [links, setLinks] = useState([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [locked, setLocked] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [linking, setLinking] = useState(null); // { fromId, mousePos }
  const [selectedId, setSelectedId] = useState(null);

  const containerRef = useRef(null);
  const saveTimerRef = useRef(null);

  // Load room data
  useEffect(() => {
    async function load() {
      try {
        const rooms = await api.getRooms();
        const r = rooms.find(rm => rm.id === roomId);
        if (!r) { navigate('/'); return; }
        setRoom(r);

        const [loadedItems, loadedLinks, canvasState] = await Promise.all([
          api.getItems(roomId),
          api.getLinks(roomId),
          api.getCanvasState(roomId),
        ]);
        setItems(loadedItems);
        setLinks(loadedLinks);
        if (canvasState) {
          setZoom(canvasState.zoom);
          setPan({ x: canvasState.pan_x, y: canvasState.pan_y });
          setLocked(!!canvasState.locked);
        }
      } catch (err) {
        console.error('Failed to load room:', err);
        navigate('/');
      }
    }
    load();
  }, [roomId, navigate]);

  // Save canvas state debounced
  const saveCanvasState = useCallback((z, p, l) => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      api.updateCanvasState(roomId, { zoom: z, pan_x: p.x, pan_y: p.y, locked: l ? 1 : 0 }).catch(console.error);
    }, 500);
  }, [roomId]);

  // Screen coords to canvas coords
  const screenToCanvas = useCallback((screenX, screenY) => {
    return {
      x: (screenX - pan.x) / zoom,
      y: (screenY - pan.y) / zoom,
    };
  }, [zoom, pan]);

  // Zoom with mouse wheel
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    const newZoom = Math.min(Math.max(zoom + delta * zoom, 0.1), 5);
    const rect = containerRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const newPan = {
      x: mx - (mx - pan.x) * (newZoom / zoom),
      y: my - (my - pan.y) * (newZoom / zoom),
    };
    setZoom(newZoom);
    setPan(newPan);
    saveCanvasState(newZoom, newPan, locked);
  }, [zoom, pan, locked, saveCanvasState]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Pan with middle mouse or space + drag
  const handleMouseDown = (e) => {
    // Close context menu on click
    if (contextMenu) {
      setContextMenu(null);
      return;
    }

    // Only start panning on middle mouse button or direct canvas click (left button)
    if (e.button === 1 || (e.button === 0 && e.target === containerRef.current)) {
      if (e.button === 0 && e.target === containerRef.current) {
        setSelectedId(null);
        if (linking) { setLinking(null); return; }
      }
      if (e.button === 1) {
        e.preventDefault();
        setIsPanning(true);
        setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      }
    }
  };

  // Allow panning on left mouse when clicking on empty canvas
  const handleCanvasMouseDown = (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.button === 0) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      setSelectedId(null);
      if (linking) setLinking(null);
    }
  };

  const handleMouseMove = (e) => {
    if (isPanning && panStart) {
      const newPan = { x: e.clientX - panStart.x, y: e.clientY - panStart.y };
      setPan(newPan);
    }
    if (linking) {
      setLinking(prev => ({ ...prev, mousePos: { x: e.clientX, y: e.clientY } }));
    }
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      setPanStart(null);
      saveCanvasState(zoom, pan, locked);
    }
  };

  // Context menu (right click on canvas background)
  const handleContextMenu = (e) => {
    e.preventDefault();
    const canvasPos = screenToCanvas(e.clientX, e.clientY);
    setContextMenu({ x: e.clientX, y: e.clientY, canvasX: canvasPos.x, canvasY: canvasPos.y });
  };

  // Add item
  const addItem = async (type, extraData = {}, x, y) => {
    if (locked) return;
    const defaults = {
      note: { title: 'New Note', content: '', width: 300, height: 220 },
      youtube: { title: 'YouTube Video', content: '', width: 320, height: 320 },
      document: { title: 'Document', content: '', width: 340, height: 260 },
      sticky: { title: '', content: '', width: 200, height: 160 },
      group: { title: 'Group', content: '', width: 400, height: 300 },
      chat: { title: 'Claude Chat', content: '', width: 420, height: 520 },
    };
    const d = defaults[type] || defaults.note;
    const item = await api.createItem(roomId, {
      type,
      title: extraData.title || d.title,
      content: extraData.content || d.content,
      x: x ?? 200,
      y: y ?? 200,
      width: d.width,
      height: d.height,
      color: extraData.color || '',
      meta: extraData.meta || {},
    });
    setItems(prev => [...prev, item]);
    return item;
  };

  // Update item position / data
  const updateItem = async (itemId, updates) => {
    if (locked && !updates._forceLocked) return;
    const { _forceLocked, ...cleanUpdates } = updates;
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...cleanUpdates } : i));
    await api.updateItem(roomId, itemId, cleanUpdates).catch(console.error);
  };

  // Delete item
  const deleteItem = async (itemId) => {
    if (locked) return;
    setItems(prev => prev.filter(i => i.id !== itemId));
    setLinks(prev => prev.filter(l => l.from_item_id !== itemId && l.to_item_id !== itemId));
    await api.deleteItem(roomId, itemId).catch(console.error);
  };

  // Link management
  const startLinking = (fromId) => {
    if (locked) return;
    setLinking({ fromId, mousePos: null });
  };

  const completeLinking = async (toId) => {
    if (!linking || linking.fromId === toId) { setLinking(null); return; }
    const link = await api.createLink(roomId, linking.fromId, toId);
    setLinks(prev => [...prev, link]);
    setLinking(null);
  };

  const deleteLink = async (linkId) => {
    if (locked) return;
    setLinks(prev => prev.filter(l => l.id !== linkId));
    await api.deleteLink(roomId, linkId).catch(console.error);
  };

  // Toggle lock
  const toggleLock = () => {
    const newLocked = !locked;
    setLocked(newLocked);
    saveCanvasState(zoom, pan, newLocked);
  };

  // Zoom controls
  const zoomIn = () => {
    const newZoom = Math.min(zoom * 1.2, 5);
    setZoom(newZoom);
    saveCanvasState(newZoom, pan, locked);
  };
  const zoomOut = () => {
    const newZoom = Math.max(zoom / 1.2, 0.1);
    setZoom(newZoom);
    saveCanvasState(newZoom, pan, locked);
  };
  const zoomFit = () => {
    if (items.length === 0) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      saveCanvasState(1, { x: 0, y: 0 }, locked);
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    items.forEach(item => {
      minX = Math.min(minX, item.x);
      minY = Math.min(minY, item.y);
      maxX = Math.max(maxX, item.x + (item.width || 300));
      maxY = Math.max(maxY, item.y + (item.height || 200));
    });
    const padding = 80;
    const contentW = maxX - minX + padding * 2;
    const contentH = maxY - minY + padding * 2;
    const newZoom = Math.min(Math.max(Math.min(rect.width / contentW, rect.height / contentH), 0.1), 2);
    const newPan = {
      x: (rect.width - contentW * newZoom) / 2 - minX * newZoom + padding * newZoom,
      y: (rect.height - contentH * newZoom) / 2 - minY * newZoom + padding * newZoom,
    };
    setZoom(newZoom);
    setPan(newPan);
    saveCanvasState(newZoom, newPan, locked);
  };

  // Context menu actions
  const contextMenuItems = contextMenu ? [
    { label: '📝 Add Note', action: () => addItem('note', {}, contextMenu.canvasX, contextMenu.canvasY) },
    { label: '🎬 Add YouTube Video', action: () => addItem('youtube', {}, contextMenu.canvasX, contextMenu.canvasY) },
    { label: '📄 Upload Document', action: () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.txt,.md,.csv,.html,.json,.js,.ts,.py,.java,.c,.cpp,.rs';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const result = await api.uploadFile(file);
          addItem('document', { title: result.filename, content: result.content }, contextMenu.canvasX, contextMenu.canvasY);
        } catch (err) {
          alert('Upload failed: ' + err.message);
        }
      };
      input.click();
    }},
    { divider: true },
    { label: '🗂️ Add Group', action: () => addItem('group', {}, contextMenu.canvasX, contextMenu.canvasY) },
    { label: '📌 Add Sticky Note', action: () => addItem('sticky', { color: 'yellow' }, contextMenu.canvasX, contextMenu.canvasY) },
    { divider: true },
    { label: '💬 Add Chat Window', action: () => addItem('chat', {}, contextMenu.canvasX, contextMenu.canvasY) },
  ] : [];

  if (!room) return null;

  // Get linked item IDs for each chat
  const getLinkedItemIds = (chatItemId) => {
    return links
      .filter(l => l.to_item_id === chatItemId || l.from_item_id === chatItemId)
      .map(l => l.from_item_id === chatItemId ? l.to_item_id : l.from_item_id);
  };

  return (
    <div
      ref={containerRef}
      className="canvas-container"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onContextMenu={handleContextMenu}
      style={{ cursor: isPanning ? 'grabbing' : (linking ? 'crosshair' : 'default') }}
    >
      <Toolbar
        room={room}
        locked={locked}
        onBack={() => navigate('/')}
        onAddNote={() => addItem('note', {}, (-pan.x + 400) / zoom, (-pan.y + 300) / zoom)}
        onAddYoutube={() => addItem('youtube', {}, (-pan.x + 400) / zoom, (-pan.y + 300) / zoom)}
        onAddDocument={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.txt,.md,.csv,.html,.json,.js,.ts,.py,.java,.c,.cpp,.rs';
          input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
              const result = await api.uploadFile(file);
              addItem('document', { title: result.filename, content: result.content }, (-pan.x + 400) / zoom, (-pan.y + 300) / zoom);
            } catch (err) {
              alert('Upload failed: ' + err.message);
            }
          };
          input.click();
        }}
        onAddGroup={() => addItem('group', {}, (-pan.x + 400) / zoom, (-pan.y + 300) / zoom)}
        onAddSticky={() => addItem('sticky', { color: 'yellow' }, (-pan.x + 400) / zoom, (-pan.y + 300) / zoom)}
        onAddChat={() => addItem('chat', {}, (-pan.x + 400) / zoom, (-pan.y + 300) / zoom)}
        dark={dark}
        toggleTheme={toggleTheme}
      />

      <div
        className="canvas-transform"
        onMouseDown={handleCanvasMouseDown}
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          width: '100%',
          height: '100%',
        }}
      >
        <LinkLines
          items={items}
          links={links}
          linking={linking}
          zoom={zoom}
          pan={pan}
          onDeleteLink={deleteLink}
        />

        {items.map(item => {
          if (item.type === 'chat') {
            return (
              <ChatWindow
                key={item.id}
                item={item}
                roomId={roomId}
                locked={locked}
                selected={selectedId === item.id}
                linking={!!linking}
                linkedItemIds={getLinkedItemIds(item.id)}
                onUpdate={(updates) => updateItem(item.id, updates)}
                onDelete={() => deleteItem(item.id)}
                onSelect={() => setSelectedId(item.id)}
                onStartLink={() => startLinking(item.id)}
                onCompleteLink={() => completeLinking(item.id)}
                zoom={zoom}
              />
            );
          }
          if (item.type === 'sticky') {
            return (
              <StickyNote
                key={item.id}
                item={item}
                locked={locked}
                selected={selectedId === item.id}
                linking={!!linking}
                onUpdate={(updates) => updateItem(item.id, updates)}
                onDelete={() => deleteItem(item.id)}
                onSelect={() => setSelectedId(item.id)}
                onStartLink={() => startLinking(item.id)}
                onCompleteLink={() => completeLinking(item.id)}
                zoom={zoom}
              />
            );
          }
          if (item.type === 'group') {
            return (
              <GroupCard
                key={item.id}
                item={item}
                items={items}
                locked={locked}
                selected={selectedId === item.id}
                linking={!!linking}
                onUpdate={(updates) => updateItem(item.id, updates)}
                onUpdateChild={(childId, updates) => updateItem(childId, updates)}
                onDelete={() => deleteItem(item.id)}
                onSelect={() => setSelectedId(item.id)}
                onStartLink={() => startLinking(item.id)}
                onCompleteLink={() => completeLinking(item.id)}
                zoom={zoom}
              />
            );
          }
          return (
            <CanvasCard
              key={item.id}
              item={item}
              roomId={roomId}
              locked={locked}
              selected={selectedId === item.id}
              linking={!!linking}
              onUpdate={(updates) => updateItem(item.id, updates)}
              onDelete={() => deleteItem(item.id)}
              onSelect={() => setSelectedId(item.id)}
              onStartLink={() => startLinking(item.id)}
              onCompleteLink={() => completeLinking(item.id)}
              zoom={zoom}
            />
          );
        })}
      </div>

      {/* Lock button */}
      <button
        className={`lock-button ${locked ? 'locked' : ''}`}
        onClick={toggleLock}
        title={locked ? 'Unlock notebook' : 'Lock notebook'}
      >
        {locked ? '🔒' : '🔓'} {locked ? 'Locked' : 'Unlocked'}
      </button>

      {/* Zoom controls */}
      <div className="zoom-controls">
        <button className="btn-icon" onClick={zoomOut} title="Zoom out" style={{ fontSize: '1rem' }}>−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button className="btn-icon" onClick={zoomIn} title="Zoom in" style={{ fontSize: '1rem' }}>+</button>
        <button className="btn-icon" onClick={zoomFit} title="Fit to view" style={{ fontSize: '0.85rem' }}>⊞</button>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
