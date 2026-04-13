import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext();

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Use the same token key as api.js (ims_token)
    const token = localStorage.getItem('ims_token');
    if (!token) {
      console.log('[SOCKET] No token found, skipping connection');
      return;
    }

    // Use SOCKET_URL for socket connection (base URL), not API_URL (which has /api path)
    const socketUrl = process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5002';
    console.log('[SOCKET] Connecting to:', socketUrl);

    const newSocket = io(socketUrl, {
      auth: { token },
      transports: ['polling', 'websocket'], // Start with polling for better compatibility
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      timeout: 20000,
      forceNew: true // Force new connection to avoid stale states
    });

    newSocket.on('connect', () => {
      console.log('[SOCKET] Connected:', newSocket.id);
      setConnected(true);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('[SOCKET] Disconnected:', reason);
      setConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error('[SOCKET] Connection error:', error.message);
      setConnected(false);
      
      // Log transport type being used for debugging
      console.log('[SOCKET] Current transport:', newSocket.io?.engine?.transport?.name || 'unknown');
      
      // If authentication error, clear token and redirect
      if (error.message === 'Authentication error') {
        console.log('[SOCKET] Auth error - clearing token');
        localStorage.removeItem('ims_token');
        localStorage.removeItem('ims_user');
      }
    });
    
    newSocket.on('reconnect', (attemptNumber) => {
      console.log('[SOCKET] Reconnected after', attemptNumber, 'attempts');
      setConnected(true);
    });
    
    newSocket.on('reconnect_attempt', (attemptNumber) => {
      console.log('[SOCKET] Reconnection attempt:', attemptNumber);
    });

    // Listen for holdings updates - this will trigger investor table refresh
    newSocket.on('holdings_update', (data) => {
      console.log('Holdings update received:', data);
      // Dispatch custom event for components to listen to
      window.dispatchEvent(new CustomEvent('holdings_update', { detail: data }));
    });

    // Listen for holding updates (singular) - for holding approval actions
    newSocket.on('holding_update', (data) => {
      console.log('Holding update received:', data);
      window.dispatchEvent(new CustomEvent('holding_update', { detail: data }));
    });

    // Listen for investor updates
    newSocket.on('investor_update', (data) => {
      console.log('Investor update received:', data);
      window.dispatchEvent(new CustomEvent('investor_update', { detail: data }));
    });

    // Listen for transfer updates
    newSocket.on('transfer_update', (data) => {
      console.log('Transfer update received:', data);
      window.dispatchEvent(new CustomEvent('transfer_update', { detail: data }));
    });

    // Listen for security updates
    newSocket.on('security_update', (data) => {
      console.log('Security update received:', data);
      window.dispatchEvent(new CustomEvent('security_update', { detail: data }));
    });

    // Listen for allocation updates
    newSocket.on('allocation_update', (data) => {
      console.log('Allocation update received:', data);
      window.dispatchEvent(new CustomEvent('allocation_update', { detail: data }));
    });

    // Listen for dividend updates
    newSocket.on('dividend_update', (data) => {
      console.log('Dividend update received:', data);
      window.dispatchEvent(new CustomEvent('dividend_update', { detail: data }));
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
};
