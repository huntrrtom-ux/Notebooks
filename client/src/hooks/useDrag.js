import { useState, useCallback, useRef, useEffect } from 'react';

export function useDrag({ x, y, zoom, locked, onUpdate }) {
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef(null);
  const posRef = useRef({ x, y });

  // Keep posRef in sync with props when not dragging
  useEffect(() => {
    if (!dragging) {
      posRef.current = { x, y };
    }
  }, [x, y, dragging]);

  const handleDragStart = useCallback((e) => {
    if (locked) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    setDragging(true);
    dragStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: posRef.current.x,
      startY: posRef.current.y,
    };
  }, [locked]);

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e) => {
      if (!dragStart.current) return;
      const dx = (e.clientX - dragStart.current.mouseX) / zoom;
      const dy = (e.clientY - dragStart.current.mouseY) / zoom;
      const newX = dragStart.current.startX + dx;
      const newY = dragStart.current.startY + dy;
      posRef.current = { x: newX, y: newY };
      onUpdate({ x: newX, y: newY });
    };

    const handleUp = () => {
      setDragging(false);
      dragStart.current = null;
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging, zoom, onUpdate]);

  return { dragging, handleDragStart };
}

export function useResize({ width, height, zoom, locked, onUpdate }) {
  const [resizing, setResizing] = useState(false);
  const resizeStart = useRef(null);

  const handleResizeStart = useCallback((e) => {
    if (locked) return;
    e.stopPropagation();
    e.preventDefault();
    setResizing(true);
    resizeStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startW: width,
      startH: height,
    };
  }, [locked, width, height]);

  useEffect(() => {
    if (!resizing) return;

    const handleMove = (e) => {
      if (!resizeStart.current) return;
      const dx = (e.clientX - resizeStart.current.mouseX) / zoom;
      const dy = (e.clientY - resizeStart.current.mouseY) / zoom;
      const newW = Math.max(200, resizeStart.current.startW + dx);
      const newH = Math.max(150, resizeStart.current.startH + dy);
      onUpdate({ width: newW, height: newH });
    };

    const handleUp = () => {
      setResizing(false);
      resizeStart.current = null;
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [resizing, zoom, onUpdate]);

  return { resizing, handleResizeStart };
}
