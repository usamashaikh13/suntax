'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { getAccessToken } from '@/lib/auth';
import type { WSMessage } from '@/types';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseWebSocketReturn {
  lastMessage: WSMessage | null;
  connectionStatus: ConnectionStatus;
  sendMessage: (data: Record<string, unknown>) => void;
  connect: () => void;
  disconnect: () => void;
}

const WS_BASE_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000/ws';

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_INTERVAL_MS = 3000;

/**
 * Custom hook for a WebSocket connection to the SunTax backend.
 * Automatically reconnects on disconnection with exponential back-off.
 *
 * @param taxReturnId - The tax return ID to subscribe to
 * @param enabled     - Set to false to disable the connection
 */
export function useWebSocket(
  taxReturnId: string | null,
  enabled = true,
): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('disconnected');

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null; // Prevent auto-reconnect on intentional close
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionStatus('disconnected');
  }, []);

  const connect = useCallback(() => {
    if (!taxReturnId || !enabled) return;

    // Close existing connection
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }

    const token = getAccessToken();
    const url = `${WS_BASE_URL}/${taxReturnId}${token ? `?token=${token}` : ''}`;

    setConnectionStatus('connecting');

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      try {
        const message = JSON.parse(event.data) as WSMessage;
        setLastMessage(message);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onerror = () => {
      setConnectionStatus('error');
    };

    ws.onclose = (event) => {
      setConnectionStatus('disconnected');

      // Reconnect unless closed cleanly or max attempts reached
      if (
        !event.wasClean &&
        reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS
      ) {
        const delay =
          RECONNECT_INTERVAL_MS *
          Math.pow(1.5, reconnectAttemptsRef.current);
        reconnectAttemptsRef.current += 1;
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, delay);
      }
    };
  }, [taxReturnId, enabled]);

  const sendMessage = useCallback((data: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  useEffect(() => {
    if (enabled && taxReturnId) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [taxReturnId, enabled, connect, disconnect]);

  return { lastMessage, connectionStatus, sendMessage, connect, disconnect };
}
