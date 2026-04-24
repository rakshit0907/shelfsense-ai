// src/hooks/useWebSocket.js — WebSocket lifecycle hook
import { useEffect, useRef, useState, useCallback } from 'react';
import { WS_URL } from '../lib/api';

export const WS_STATUS = {
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  ERROR: 'error',
};

export function useWebSocket(path = '/ws/live', onMessage) {
  const ws = useRef(null);
  const reconnectTimer = useRef(null);
  const [status, setStatus] = useState(WS_STATUS.DISCONNECTED);
  const reconnectAttempts = useRef(0);
  const MAX_RECONNECT = 5;

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;

    setStatus(WS_STATUS.CONNECTING);
    const url = `${WS_URL}${path}`;
    const socket = new WebSocket(url);
    ws.current = socket;

    socket.onopen = () => {
      setStatus(WS_STATUS.CONNECTED);
      reconnectAttempts.current = 0;
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage?.(data);
      } catch (e) {
        console.warn('[WS] Parse error:', e);
      }
    };

    socket.onerror = () => {
      setStatus(WS_STATUS.ERROR);
    };

    socket.onclose = () => {
      setStatus(WS_STATUS.DISCONNECTED);
      ws.current = null;

      // Auto-reconnect with backoff
      if (reconnectAttempts.current < MAX_RECONNECT) {
        const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 15000);
        reconnectAttempts.current++;
        reconnectTimer.current = setTimeout(connect, delay);
      }
    };
  }, [path, onMessage]);

  const disconnect = useCallback(() => {
    clearTimeout(reconnectTimer.current);
    reconnectAttempts.current = MAX_RECONNECT; // prevent reconnect
    ws.current?.close();
  }, []);

  const send = useCallback((data) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return { status, send, connect, disconnect };
}
