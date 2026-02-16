import { useState, useEffect, useRef, useCallback } from 'react';
import type { RichLogEntry } from '../types/agent';
import { getLogsStreamUrl } from '../api/agents';

interface UseAgentLogsOptions {
  maxEntries?: number;
  reconnectDelay?: number;
}

export function useAgentLogs(
  agentId: string | null,
  options: UseAgentLogsOptions = {}
) {
  const { maxEntries = 1000, reconnectDelay = 3000 } = options;
  const [logs, setLogs] = useState<RichLogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const connect = useCallback(() => {
    if (!agentId) return;

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const url = getLogsStreamUrl(agentId);
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const entry: RichLogEntry = JSON.parse(event.data);
        setLogs((prevLogs) => {
          const newLogs = [...prevLogs, entry];
          if (newLogs.length > maxEntries) {
            return newLogs.slice(-maxEntries);
          }
          return newLogs;
        });
      } catch (e) {
        console.error('Failed to parse log entry:', e);
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      setError('Connection lost');
      eventSource.close();

      // Attempt to reconnect
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, reconnectDelay);
    };
  }, [agentId, maxEntries, reconnectDelay]);

  useEffect(() => {
    if (agentId) {
      clearLogs();
      connect();
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [agentId, connect, clearLogs]);

  return {
    logs,
    isConnected,
    error,
    clearLogs,
    reconnect: connect,
  };
}
