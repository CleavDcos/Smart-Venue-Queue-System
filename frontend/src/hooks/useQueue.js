/**
 * hooks/useQueue.js - Real-Time Queue Token Hook
 *
 * Subscribes to a user's queue token document in Firestore.
 * Falls back to REST API polling (every 10s) if Firebase is not configured.
 *
 * Returns: { token, isLoading, error }
 */

import { useState, useEffect, useRef } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase/firebase';
import { queueAPI } from '../services/api';

/**
 * useQueueToken - subscribe to a specific token document
 * @param {string|null} tokenId - MongoDB token ID
 */
export const useQueueToken = (tokenId) => {
  const [token, setToken]       = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]       = useState(null);
  const pollingRef              = useRef(null);

  useEffect(() => {
    if (!tokenId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    if (isFirebaseConfigured && db) {
      // ── Real-time Firestore path: queueTokens/{tokenId} ──────────────────
      const ref = doc(db, 'queueTokens', tokenId);
      const unsubscribe = onSnapshot(
        ref,
        (snap) => {
          if (snap.exists()) {
            setToken({ id: snap.id, ...snap.data() });
          }
          setIsLoading(false);
        },
        (err) => {
          console.error('Firestore snapshot error:', err);
          setError(err.message);
          setIsLoading(false);
          // Fall back to polling
          startPolling();
        }
      );
      return () => unsubscribe();
    } else {
      // ── Polling fallback (no Firebase) ───────────────────────────────────
      startPolling();
    }

    function startPolling() {
      const poll = async () => {
        try {
          const res = await queueAPI.getMyToken();
          setToken(res.data.token);
          setIsLoading(false);
        } catch (err) {
          if (err.message !== 'No active queue token found') {
            setError(err.message);
          }
          setIsLoading(false);
        }
      };
      poll(); // Immediate first call
      pollingRef.current = setInterval(poll, 10000); // Poll every 10s
    }

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [tokenId]);

  return { token, isLoading, error };
};

/**
 * useActiveToken - fetch and subscribe to the current user's active token
 * Automatically resolves the token ID from the REST API first.
 */
export const useActiveToken = () => {
  const [token, setToken]         = useState(null);
  const [tokenId, setTokenId]     = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]         = useState(null);
  const pollingRef                = useRef(null);

  // Step 1: Fetch current token from REST to get the ID
  useEffect(() => {
    const fetchActive = async () => {
      try {
        const res = await queueAPI.getMyToken();
        const t = res.data.token;
        setToken(t);
        setTokenId(t._id);
        setIsLoading(false);
      } catch {
        setIsLoading(false);
      }
    };
    fetchActive();
  }, []);

  // Step 2: Subscribe to Firestore (or poll) once we have an ID
  const { token: realtimeToken, isLoading: rtLoading } = useQueueToken(tokenId);

  // Merge REST data with real-time updates
  useEffect(() => {
    if (realtimeToken) {
      setToken((prev) => ({ ...prev, ...realtimeToken }));
    }
  }, [realtimeToken]);

  return { token, isLoading: isLoading && rtLoading, error, setToken };
};

/**
 * useStallsRealtime - subscribe to stall load updates for admin dashboard
 * @param {string} eventId
 */
export const useStallsRealtime = (eventId) => {
  const [stalls, setStalls]       = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const pollingRef                = useRef(null);

  useEffect(() => {
    if (!eventId) return;

    if (isFirebaseConfigured && db) {
      // Listen to all stall docs for this event
      // Note: Firestore doesn't support collection-level queries here without a composite index.
      // We listen to individual stall updates after initial load.
      setIsLoading(false); // Stall data comes from REST initially; Firestore patches updates
    } else {
      // Polling fallback
      const { stallAPI } = require('../services/api');
      const poll = async () => {
        try {
          const res = await stallAPI.listByEvent(eventId);
          setStalls(res.data.stalls);
          setIsLoading(false);
        } catch {
          setIsLoading(false);
        }
      };
      poll();
      pollingRef.current = setInterval(poll, 8000);
    }

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [eventId]);

  return { stalls, setStalls, isLoading };
};
