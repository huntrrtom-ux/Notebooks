export default function Toolbar({
  room, locked, onBack, onAddNote, onAddYoutube, onAddDocument,
  onAddGroup, onAddSticky, onAddChat, dark, toggleTheme
}) {
  return (
    <div className="toolbar">
      <button className="btn-icon" onClick={onBack} title="Back to rooms">←</button>
      <span className="room-name-display">{room?.name}</span>
      <div className="toolbar-divider" />
      <button className="btn-icon" onClick={onAddNote} title="Add Note" disabled={locked}>📝</button>
      <button className="btn-icon" onClick={onAddYoutube} title="Add YouTube Video" disabled={locked}>🎬</button>
      <button className="btn-icon" onClick={onAddDocument} title="Upload Document" disabled={locked}>📄</button>
      <button className="btn-icon" onClick={onAddGroup} title="Add Group" disabled={locked}>🗂️</button>
      <button className="btn-icon" onClick={onAddSticky} title="Add Sticky Note" disabled={locked}>📌</button>
      <div className="toolbar-divider" />
      <button className="btn-icon" onClick={onAddChat} title="Add Chat Window" disabled={locked}>💬</button>
      <div className="toolbar-divider" />
      <button className="btn-icon" onClick={toggleTheme} title="Toggle dark mode">
        {dark ? '☀️' : '🌙'}
      </button>
    </div>
  );
}
