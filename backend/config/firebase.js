/**
 * config/firebase.js - Firebase Admin SDK Initialization
 * Used for Firestore (real-time data sync) and FCM (push notifications).
 *
 * To set up:
 * 1. Go to Firebase Console → Project Settings → Service Accounts
 * 2. Generate a new private key → download JSON
 * 3. Copy values to your .env file
 */

const admin = require('firebase-admin');

let firebaseApp;

const initFirebase = () => {
  if (firebaseApp) return firebaseApp;

  // Build credential from environment variables
  // This avoids committing the service account JSON to source control
  const serviceAccount = {
    type: 'service_account',
    project_id: process.env.FIREBASE_PROJECT_ID,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    // Replace escaped newlines (env vars store \n as literal text)
    private_key: process.env.FIREBASE_PRIVATE_KEY
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      : undefined,
  };

  // If Firebase env vars are not set, return a mock for local dev without Firebase
  if (!process.env.FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID === 'your-firebase-project-id') {
    console.warn('⚠️  Firebase not configured. Real-time sync and notifications disabled.');
    console.warn('   Set FIREBASE_* env vars to enable Firebase features.');
    return null;
  }

  try {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('✅ Firebase Admin SDK initialized');
    return firebaseApp;
  } catch (error) {
    console.error('❌ Firebase initialization error:', error.message);
    return null;
  }
};

// Initialize on module load
initFirebase();

/**
 * Get Firestore instance (or null if Firebase not configured)
 */
const getFirestore = () => {
  if (!admin.apps.length) return null;
  return admin.firestore();
};

/**
 * Get Firebase Messaging instance (or null if Firebase not configured)
 */
const getMessaging = () => {
  if (!admin.apps.length) return null;
  return admin.messaging();
};

module.exports = { getFirestore, getMessaging, admin };
