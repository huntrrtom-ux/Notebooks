import { Routes, Route } from 'react-router-dom';
import RoomManager from './components/RoomManager';
import NotebookCanvas from './components/NotebookCanvas';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RoomManager />} />
      <Route path="/room/:roomId" element={<NotebookCanvas />} />
    </Routes>
  );
}
