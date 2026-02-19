import { useEffect, useRef, useState } from 'react';
import { Terminal as TerminalIcon, RefreshCw } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import type { Agent } from '../types/agent';
import { getTerminalWsUrl } from '../api/agents';

interface TerminalViewProps {
  agent: Agent;
}

export function TerminalView({ agent }: TerminalViewProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'unavailable'>('disconnected');

  const isRunning = agent.status === 'running';

  const connect = () => {
    if (!isRunning || !termRef.current) return;

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    setConnectionStatus('connecting');
    const url = getTerminalWsUrl(agent.id);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      setConnectionStatus('connected');
      termRef.current?.clear();
      // Send resize info
      if (fitAddonRef.current && termRef.current) {
        const dims = fitAddonRef.current.proposeDimensions();
        if (dims) {
          ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
        }
      }
    };

    ws.onmessage = (event) => {
      if (termRef.current) {
        if (event.data instanceof ArrayBuffer) {
          termRef.current.write(new Uint8Array(event.data));
        } else {
          termRef.current.write(event.data);
        }
      }
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
    };

    ws.onerror = () => {
      setConnectionStatus('disconnected');
    };
  };

  useEffect(() => {
    if (!terminalRef.current) return;

    // Create terminal
    const term = new Terminal({
      theme: {
        background: '#0a0a0f',
        foreground: '#e0e0e8',
        cursor: '#6366f1',
        cursorAccent: '#0a0a0f',
        selectionBackground: 'rgba(99, 102, 241, 0.3)',
        selectionForeground: '#e0e0e8',
        black: '#0a0a0f',
        red: '#ef4444',
        green: '#10b981',
        yellow: '#f59e0b',
        blue: '#6366f1',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e0e0e8',
        brightBlack: '#4a4a5e',
        brightRed: '#f87171',
        brightGreen: '#34d399',
        brightYellow: '#fbbf24',
        brightBlue: '#818cf8',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#f5f5f5',
      },
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(terminalRef.current);

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Fit to container
    try {
      fitAddon.fit();
    } catch {
      // Terminal may not be visible yet
    }

    // Handle user input -> WebSocket
    term.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(data);
      }
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        if (wsRef.current?.readyState === WebSocket.OPEN && termRef.current) {
          const dims = fitAddon.proposeDimensions();
          if (dims) {
            wsRef.current.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
          }
        }
      } catch {
        // ignore
      }
    });

    resizeObserver.observe(terminalRef.current);

    // Auto-connect if running
    if (isRunning) {
      // Small delay to let terminal render
      setTimeout(connect, 100);
    } else {
      setConnectionStatus('unavailable');
      term.write('\x1b[33mAgent is not running. Start the agent to use the terminal.\x1b[0m\r\n');
    }

    return () => {
      resizeObserver.disconnect();
      wsRef.current?.close();
      term.dispose();
    };
  }, [agent.id]);

  // Reconnect when agent status changes
  useEffect(() => {
    if (isRunning && connectionStatus === 'unavailable') {
      connect();
    } else if (!isRunning) {
      setConnectionStatus('unavailable');
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (termRef.current) {
        termRef.current.write('\r\n\x1b[33mAgent stopped.\x1b[0m\r\n');
      }
    }
  }, [agent.status]);

  const statusColors: Record<string, string> = {
    connecting: 'text-yellow-400',
    connected: 'text-emerald-400',
    disconnected: 'text-red-400',
    unavailable: 'text-[#4a4a5e]',
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Terminal header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1e1e3a]">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-3.5 h-3.5 text-[#4a4a5e]" />
          <span className="text-xs text-[#7a7a8e]">Shell</span>
          <span className={`text-[10px] ${statusColors[connectionStatus]}`}>
            {connectionStatus}
          </span>
        </div>
        <button
          onClick={connect}
          disabled={!isRunning}
          className="p-1 text-[#4a4a5e] hover:text-[#7a7a8e] hover:bg-[#1a1a2e] rounded-lg transition-all duration-200 disabled:opacity-30"
          title="Reconnect"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Terminal container */}
      <div ref={terminalRef} className="flex-1 p-2" />
    </div>
  );
}
