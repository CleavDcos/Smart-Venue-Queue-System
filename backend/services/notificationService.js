/**
 * services/notificationService.js - Firebase Cloud Messaging (FCM)
 *
 * Handles all push notifications sent to users:
 *   - "Your turn in X minutes" (approaching service)
 *   - "Move to Stall B" (reassignment)
 *   - "You are next!" (immediate service)
 *   - "Service complete" (done)
 */

const { getMessaging } = require('../config/firebase');

/**
 * Core function to send a push notification via FCM.
 *
 * @param {string} fcmToken - User's device FCM registration token
 * @param {string} title - Notification title
 * @param {string} body - Notification body text
 * @param {Object} data - Optional key-value data payload for the app
 */
const sendPushNotification = async (fcmToken, title, body, data = {}) => {
  const messaging = getMessaging();

  if (!messaging) {
    // Firebase not configured — log instead of crashing
    console.log(`[NOTIFICATION MOCK] To: ${fcmToken?.substring(0, 20)}...`);
    console.log(`  📣 ${title}: ${body}`);
    return { success: true, mock: true };
  }

  if (!fcmToken) {
    console.warn('[Notification] No FCM token provided, skipping push.');
    return { success: false, reason: 'No FCM token' };
  }

  try {
    const message = {
      token: fcmToken,
      notification: {
        title,
        body,
      },
      data: {
        // All data values must be strings for FCM
        ...Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, String(v)])
        ),
        timestamp: new Date().toISOString(),
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'queue_updates',
          priority: 'max',
          sound: 'default',
        },
      },
      apns: {
        payload: {
          aps: {
            alert: { title, body },
            sound: 'default',
            badge: 1,
          },
        },
      },
    };

    const response = await messaging.send(message);
    console.log(`✅ Notification sent: ${response}`);
    return { success: true, messageId: response };
  } catch (error) {
    console.error('❌ FCM send error:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Notify user that they are approaching the front of the queue.
 *
 * @param {string} fcmToken
 * @param {number} minutesLeft
 * @param {string} stallName
 */
const sendTurnApproachingNotification = async (fcmToken, minutesLeft, stallName) => {
  return sendPushNotification(
    fcmToken,
    '⏰ Your Turn is Approaching!',
    `You'll be served at ${stallName} in approximately ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`,
    { type: 'turn_approaching', minutesLeft: minutesLeft.toString(), stallName }
  );
};

/**
 * Notify user that they are next in line.
 *
 * @param {string} fcmToken
 * @param {string} stallName
 * @param {string} stallLocation
 */
const sendYouAreNextNotification = async (fcmToken, stallName, stallLocation) => {
  return sendPushNotification(
    fcmToken,
    '🎉 You Are Next!',
    `Please proceed to ${stallName} (${stallLocation}) immediately. Your token is ready!`,
    { type: 'you_are_next', stallName, stallLocation }
  );
};

/**
 * Notify user that their service is complete.
 *
 * @param {string} fcmToken
 * @param {string} stallName
 */
const sendServiceCompleteNotification = async (fcmToken, stallName) => {
  return sendPushNotification(
    fcmToken,
    '✅ Service Complete',
    `Thank you! Your service at ${stallName} is complete. Enjoy the event!`,
    { type: 'service_complete', stallName }
  );
};

/**
 * Notify user that they have been moved to a different stall.
 *
 * @param {string} fcmToken
 * @param {string} newStallName
 * @param {string} newStallLocation
 * @param {number} newPosition
 * @param {number} estimatedWait
 */
const sendReassignmentNotification = async (
  fcmToken,
  newStallName,
  newStallLocation,
  newPosition,
  estimatedWait
) => {
  return sendPushNotification(
    fcmToken,
    '🔄 Queue Update — Please Move',
    `You've been reassigned to ${newStallName} (${newStallLocation}). Position: #${newPosition}, Wait: ~${estimatedWait} min.`,
    {
      type: 'reassignment',
      newStallName,
      newStallLocation,
      newPosition: newPosition.toString(),
      estimatedWait: estimatedWait.toString(),
    }
  );
};

/**
 * Send a broadcast notification to multiple users (admin use).
 *
 * @param {string[]} fcmTokens - Array of FCM tokens
 * @param {string} title
 * @param {string} body
 */
const sendBroadcastNotification = async (fcmTokens, title, body) => {
  const messaging = getMessaging();

  if (!messaging || !fcmTokens.length) {
    console.log(`[BROADCAST MOCK] ${title}: ${body} → ${fcmTokens.length} users`);
    return { success: true, mock: true };
  }

  try {
    // FCM multicast supports up to 500 tokens per call
    const chunks = [];
    for (let i = 0; i < fcmTokens.length; i += 500) {
      chunks.push(fcmTokens.slice(i, i + 500));
    }

    let totalSent = 0;
    for (const chunk of chunks) {
      const response = await messaging.sendMulticast({
        tokens: chunk,
        notification: { title, body },
      });
      totalSent += response.successCount;
    }

    return { success: true, sent: totalSent };
  } catch (error) {
    console.error('Broadcast error:', error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendPushNotification,
  sendTurnApproachingNotification,
  sendYouAreNextNotification,
  sendServiceCompleteNotification,
  sendReassignmentNotification,
  sendBroadcastNotification,
};
