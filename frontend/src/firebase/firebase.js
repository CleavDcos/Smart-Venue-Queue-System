/**
 * firebase/firebase.js - Firebase Web Client SDK Initialization
 *
 * Initializes Firebase for:
 *   - Firestore: Real-time queue token and stall load listeners
 *   - FCM: Push notification subscription (browser)
 *
 * Values come from VITE_FIREBASE_* environment variables.
 */

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

// Check if Firebase is properly configured
const isFirebaseConfigured = firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== 'your-api-key' &&
  firebaseConfig.projectId &&
  firebaseConfig.projectId !== 'your-project-id';

let app = null;
let db  = null;
let messaging = null;

if (isFirebaseConfigured) {
  try {
    app       = initializeApp(firebaseConfig);
    db        = getFirestore(app);
    // Messaging only available in secure contexts (HTTPS or localhost)
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      messaging = getMessaging(app);
    }
    console.log('✅ Firebase Web SDK initialized');
  } catch (error) {
    console.warn('⚠️  Firebase initialization failed:', error.message);
  }
} else {
  console.warn('⚠️  Firebase not configured. Set VITE_FIREBASE_* env vars for real-time features.');
  console.warn('   The app will work without Firebase (polling mode).');
}

/**
 * Request notification permission and get FCM token.
 * Call this after user grants permission (e.g., on first login).
 *
 * @returns {string|null} FCM registration token or null
 */
export const requestNotificationPermission = async () => {
  if (!messaging) return null;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    });

    return token;
  } catch (error) {
    console.warn('FCM token error:', error.message);
    return null;
  }
};

/**
 * Set up foreground message handler.
 * Returns an unsubscribe function.
 *
 * @param {Function} callback - Called with { title, body, data }
 */
export const onForegroundMessage = (callback) => {
  if (!messaging) return () => {};

  return onMessage(messaging, (payload) => {
    callback({
      title: payload.notification?.title || 'Queue Update',
      body:  payload.notification?.body  || '',
      data:  payload.data || {},
    });
  });
};

export { db, messaging, isFirebaseConfigured };
export default app;
