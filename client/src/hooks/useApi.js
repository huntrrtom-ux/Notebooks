const BASE = '/api';

async function request(url, options = {}) {
  const res = await fetch(BASE + url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const error = new Error(err.error || 'Request failed');
    if (err.details) error.details = err.details;
    throw error;
  }
  return res.json();
}

export const api = {
  // Rooms
  getRooms: () => request('/rooms'),
  createRoom: (name) => request('/rooms', { method: 'POST', body: JSON.stringify({ name }) }),
  updateRoom: (id, name) => request(`/rooms/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  deleteRoom: (id) => request(`/rooms/${id}`, { method: 'DELETE' }),

  // Canvas state
  getCanvasState: (roomId) => request(`/rooms/${roomId}/canvas`),
  updateCanvasState: (roomId, state) => request(`/rooms/${roomId}/canvas`, { method: 'PATCH', body: JSON.stringify(state) }),

  // Items
  getItems: (roomId) => request(`/rooms/${roomId}/items`),
  createItem: (roomId, item) => request(`/rooms/${roomId}/items`, { method: 'POST', body: JSON.stringify(item) }),
  updateItem: (roomId, itemId, updates) => request(`/rooms/${roomId}/items/${itemId}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  deleteItem: (roomId, itemId) => request(`/rooms/${roomId}/items/${itemId}`, { method: 'DELETE' }),

  // Links
  getLinks: (roomId) => request(`/rooms/${roomId}/links`),
  createLink: (roomId, fromId, toId) => request(`/rooms/${roomId}/links`, { method: 'POST', body: JSON.stringify({ from_item_id: fromId, to_item_id: toId }) }),
  deleteLink: (roomId, linkId) => request(`/rooms/${roomId}/links/${linkId}`, { method: 'DELETE' }),

  // Chat
  getMessages: (roomId, chatItemId) => request(`/rooms/${roomId}/messages/${chatItemId}`),
  clearMessages: (roomId, chatItemId) => request(`/rooms/${roomId}/messages/${chatItemId}`, { method: 'DELETE' }),

  // YouTube
  fetchTranscript: (url) => request('/youtube/transcript', { method: 'POST', body: JSON.stringify({ url }) }),

  // Upload
  uploadFile: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(BASE + '/upload', { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Upload failed');
    }
    return res.json();
  },
};
