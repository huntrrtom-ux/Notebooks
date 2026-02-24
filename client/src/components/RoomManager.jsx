import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../hooks/useApi';
import { useTheme } from '../contexts/ThemeContext';

export default function RoomManager() {
  const [rooms, setRooms] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const navigate = useNavigate();
  const { dark, toggleTheme } = useTheme();

  useEffect(() => {
    api.getRooms().then(setRooms).catch(console.error);
  }, []);

  const createRoom = async () => {
    if (!newName.trim()) return;
    const room = await api.createRoom(newName.trim());
    setRooms(prev => [room, ...prev]);
    setNewName('');
    setShowCreate(false);
  };

  const deleteRoom = async (e, id) => {
    e.stopPropagation();
    if (!confirm('Delete this room and all its contents?')) return;
    await api.deleteRoom(id);
    setRooms(prev => prev.filter(r => r.id !== id));
  };

  const startRename = (e, room) => {
    e.stopPropagation();
    setEditingId(room.id);
    setEditName(room.name);
  };

  const saveRename = async (id) => {
    if (editName.trim()) {
      const updated = await api.updateRoom(id, editName.trim());
      setRooms(prev => prev.map(r => r.id === id ? updated : r));
    }
    setEditingId(null);
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr + 'Z');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="room-manager">
      <div className="theme-toggle">
        <button className="btn-icon" onClick={toggleTheme} title="Toggle dark mode">
          {dark ? '☀️' : '🌙'}
        </button>
      </div>

      <div className="room-manager-header">
        <h1>Notebook Canvas</h1>
        <p>Your workspace for ideas, research, and conversations</p>
      </div>

      <div className="room-manager-actions">
        {showCreate ? (
          <>
            <input
              className="input"
              placeholder="Room name..."
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createRoom()}
              autoFocus
            />
            <button className="btn btn-primary" onClick={createRoom}>Create</button>
            <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
          </>
        ) : (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + New Room
          </button>
        )}
      </div>

      {rooms.length === 0 ? (
        <div className="room-empty">
          <p>No rooms yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="room-grid">
          {rooms.map(room => (
            <div
              key={room.id}
              className="room-card"
              onClick={() => navigate(`/room/${room.id}`)}
            >
              {editingId === room.id ? (
                <input
                  className="input"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveRename(room.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  onBlur={() => saveRename(room.id)}
                  onClick={e => e.stopPropagation()}
                  autoFocus
                  style={{ width: '100%', marginBottom: 8 }}
                />
              ) : (
                <h3>{room.name}</h3>
              )}
              <span className="room-date">{formatDate(room.updated_at)}</span>

              <div className="room-card-actions">
                <button className="btn-icon" onClick={e => startRename(e, room)} title="Rename">
                  ✎
                </button>
                <button className="btn-icon" onClick={e => deleteRoom(e, room.id)} title="Delete"
                  style={{ color: 'var(--danger)' }}>
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
