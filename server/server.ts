import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import path from 'path';
import { Server, Socket } from 'socket.io';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import webpush from 'web-push';
import { dbAsync } from './database';
import {
  initRetentionCron,
  purgeExpiredMessages,
  RETENTION_MS,
  RETENTION_DAYS
} from './retention';
import {
  RegisterSchema,
  LoginSchema,
  SendMessageSchema,
  UnsendMessageSchema,
  PushSubscribeSchema
} from './validators';

const JWT_SECRET = process.env.JWT_SECRET || 'nexus_quantum_jwt_key_2026';

// VAPID keys for PWA Background Push Notifications
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BHLuQR0EQSlrMj8m8OZ1YKNXi5fJ_tZi5wVmPxLPw6xY7dNbts3ZiMV_YELv09-etdoZh_Z8tU9_T1X39cF3gas';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '9RZOleVvSl8ozkZZz2u20DUGWQOv8IfS2oJ5rsOMvck';

webpush.setVapidDetails(
  'mailto:support@nexus-quantum-comms.local',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e8, // 100MB for live media packets
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Ephemeral in-memory media storage (1-day retention, 0 DB disk bloat)
export interface EphemeralMedia {
  id: string;
  type: string;
  dataUrl: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  conversationId: string;
  conversation_id: string;
  senderId: number;
  sender_id: number;
  senderName?: string;
  recipientId: number;
  recipient_id: number;
  createdAt: number;
  created_at: number;
  isUnsent?: number;
  is_unsent?: number;
}
const ephemeralMediaCache = new Map<string, EphemeralMedia[]>();
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Serve static frontend (dist if built, otherwise public)
const distPath = path.join(__dirname, '..', 'dist');
const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(distPath));
app.use(express.static(publicPath));

interface AuthRequest extends Request {
  user?: any;
}

// Authentication Middleware
function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
}

// REST APIs: Register with Zod Validation
app.post('/api/register', async (req: Request, res: Response) => {
  const parseResult = RegisterSchema.safeParse(req.body);
  if (!parseResult.success) {
    const errorMsg = parseResult.error.issues.map((i) => i.message).join(', ');
    return res.status(400).json({ error: errorMsg });
  }

  const { name, email, phone, password } = parseResult.data;
  const trimmedEmail = email.toLowerCase().trim();
  const trimmedPhone = phone ? phone.trim() : '';

  try {
    const existingEmail = await dbAsync.get(
      'SELECT id FROM users WHERE email = ?',
      [trimmedEmail]
    );
    if (existingEmail) {
      return res.status(409).json({ error: 'Email address already registered' });
    }

    if (trimmedPhone) {
      const existingPhone = await dbAsync.get(
        'SELECT id FROM users WHERE phone = ?',
        [trimmedPhone]
      );
      if (existingPhone) {
        return res.status(409).json({ error: 'Phone number already registered' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await dbAsync.run(
      'INSERT INTO users (name, email, phone, password) VALUES (?, ?, ?, ?)',
      [name.trim(), trimmedEmail, trimmedPhone, hashedPassword]
    );

    const user = { id: result.lastID, name: name.trim(), email: trimmedEmail, phone: trimmedPhone };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({ user, token });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// REST APIs: Login with Zod Validation
app.post('/api/login', async (req: Request, res: Response) => {
  const parseResult = LoginSchema.safeParse(req.body);
  if (!parseResult.success) {
    const errorMsg = parseResult.error.issues.map((i) => i.message).join(', ');
    return res.status(400).json({ error: errorMsg });
  }

  const { identifier, password } = parseResult.data;

  try {
    const user = await dbAsync.get(
      'SELECT * FROM users WHERE email = ? OR phone = ?',
      [identifier.toLowerCase().trim(), identifier.trim()]
    );
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const payload = { id: user.id, name: user.name, email: user.email, phone: user.phone };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });

    res.json({ user: payload, token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Current User Profile
app.get('/api/me', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const user = await dbAsync.get('SELECT id, name, email, phone, avatar FROM users WHERE id = ?', [req.user.id]);
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching profile' });
  }
});

// User Search by Phone or Email
app.get('/api/users/search', authenticateToken, async (req: AuthRequest, res: Response) => {
  const query = String(req.query.q || '').trim();
  if (!query) return res.json({ users: [] });

  try {
    const users = await dbAsync.all(
      `SELECT id, name, email, phone, avatar FROM users 
       WHERE id != ? AND (email LIKE ? OR phone LIKE ? OR name LIKE ?) 
       LIMIT 20`,
      [req.user.id, `%${query}%`, `%${query}%`, `%${query}%`]
    );
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
});

function getConversationId(id1: number, id2: number): string {
  const sorted = [Number(id1), Number(id2)].sort((a, b) => a - b);
  return `conv_${sorted[0]}_${sorted[1]}`;
}

// Get User's Conversations
app.get('/api/conversations', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const convs: any[] = await dbAsync.all(
      `SELECT c.id, c.updated_at,
              CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END as peer_id,
              u.name as peer_name, u.email as peer_email, u.phone as peer_phone, u.avatar as peer_avatar
       FROM conversations c
       JOIN users u ON u.id = CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END
       WHERE c.user1_id = ? OR c.user2_id = ?
       ORDER BY c.updated_at DESC`,
      [req.user.id, req.user.id, req.user.id, req.user.id]
    );

    const sevenDaysAgo = Date.now() - RETENTION_MS;

    for (const c of convs) {
      const lastMsg = await dbAsync.get(
        `SELECT id, text, is_unsent, sender_id, created_at 
         FROM messages 
         WHERE conversation_id = ? AND created_at >= ? 
         ORDER BY created_at DESC LIMIT 1`,
        [c.id, sevenDaysAgo]
      );
      c.lastMessage = lastMsg || null;
      c.isOnline = onlineUsers.has(c.peer_id);
    }

    res.json({ conversations: convs });
  } catch (err) {
    console.error('Error fetching conversations:', err);
    res.status(500).json({ error: 'Could not fetch conversations' });
  }
});

// Paginated text history + 1-day ephemeral live media (strictly within retention)
app.get('/api/messages/:conversationId', authenticateToken, async (req: Request, res: Response) => {
  const conversationId = String(req.params.conversationId);
  const before = req.query.before ? Number(req.query.before) : Date.now() + 10000;
  const limit = Math.min(Number(req.query.limit) || 30, 50);
  const sevenDaysAgo = Date.now() - RETENTION_MS;
  const oneDayAgo = Date.now() - ONE_DAY_MS;

  try {
    const textMessages = await dbAsync.all(
      `SELECT id, conversation_id, sender_id, recipient_id, text, is_unsent, is_read, created_at 
       FROM messages 
       WHERE conversation_id = ? AND created_at < ? AND created_at >= ?
       ORDER BY created_at DESC LIMIT ?`,
      [conversationId, before, sevenDaysAgo, limit]
    );

    // Get 1-day ephemeral media for this conversation
    const cachedMedia = (ephemeralMediaCache.get(conversationId) || []).filter(
      (m) => m.created_at >= oneDayAgo && m.created_at < before
    );

    // Merge DB text messages with ephemeral media and sort chronologically
    const allMessages = [...textMessages, ...cachedMedia].sort((a, b) => (a.created_at || a.createdAt) - (b.created_at || b.createdAt));
    res.json({ messages: allMessages });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch messages' });
  }
});

// Delete Entire Conversation & Text History
app.delete('/api/conversations/:conversationId', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { conversationId } = req.params;
  try {
    const conv = await dbAsync.get(
      'SELECT id FROM conversations WHERE id = ? AND (user1_id = ? OR user2_id = ?)',
      [conversationId, req.user.id, req.user.id]
    );
    if (!conv) {
      return res.status(404).json({ error: 'Conversation not found or unauthorized' });
    }

    await dbAsync.run('DELETE FROM messages WHERE conversation_id = ?', [conversationId]);
    await dbAsync.run('DELETE FROM conversations WHERE id = ?', [conversationId]);

    res.json({ success: true });
  } catch (err) {
    console.error('Delete chat error:', err);
    res.status(500).json({ error: 'Could not delete conversation' });
  }
});

// PWA Push Notification Endpoints with Zod Validation
app.get('/api/push/vapid-key', (_req: Request, res: Response) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

app.post('/api/push/subscribe', authenticateToken, async (req: AuthRequest, res: Response) => {
  const parseResult = PushSubscribeSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid push subscription payload' });
  }

  const { subscription } = parseResult.data;

  try {
    await dbAsync.run(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) 
       VALUES (?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`,
      [req.user.id, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]
    );
    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Error saving push subscription:', err);
    res.status(500).json({ error: 'Failed to subscribe to push' });
  }
});

// Daily Cron Webhook Endpoint (for external cron services or platform schedulers)
app.all('/api/cron/purge-expired', async (req: Request, res: Response) => {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];
  const querySecret = req.query.secret;

  if (secret && authHeader !== `Bearer ${secret}` && querySecret !== secret) {
    return res.status(401).json({ error: 'Unauthorized cron request' });
  }

  try {
    const stats = await purgeExpiredMessages();
    res.json({
      success: true,
      message: '7-day retention cleanup complete',
      retentionDays: RETENTION_DAYS,
      ...stats
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Retention purge failed' });
  }
});

// Decline call from notification action while app is offline
app.post('/api/calls/decline-offline', async (req: Request, res: Response) => {
  const { callerId, targetUserId } = req.body;
  const caller = Number(callerId);
  const target = Number(targetUserId);
  if (caller && target && pendingCalls.has(target) && pendingCalls.get(target)?.callerId === caller) {
    const pending = pendingCalls.get(target)!;
    clearTimeout(pending.timeoutId);
    pendingCalls.delete(target);
    activeCalls.delete(caller);
    activeCalls.delete(target);
    if (onlineUsers.has(caller)) {
      onlineUsers.get(caller)!.forEach((sockId) => {
        io.to(sockId).emit('call_response', {
          responderId: target,
          accepted: false
        });
        io.to(sockId).emit('call_ended', { byUserId: target });
      });
    }
    return res.json({ success: true });
  }
  res.status(400).json({ error: 'No active pending call' });
});

async function sendPushToUser(userId: number, payload: any) {
  try {
    const subs: any[] = await dbAsync.all(
      'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?',
      [userId]
    );
    for (const sub of subs) {
      const pushConfig = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      };
      webpush.sendNotification(pushConfig, JSON.stringify(payload)).catch((err: any) => {
        if (err.statusCode === 410 || err.statusCode === 404) {
          dbAsync.run('DELETE FROM push_subscriptions WHERE endpoint = ?', [sub.endpoint]);
        }
      });
    }
  } catch (err) {
    console.error('Error in sendPushToUser:', err);
  }
}

async function recordMissedCall(callerId: number, targetId: number, callerName: string, callType: 'audio' | 'video') {
  const convId = getConversationId(callerId, targetId);
  const now = Date.now();
  const msgId = `missed_${now}_${Math.random().toString(36).substr(2, 6)}`;
  const text = `Missed ${callType === 'video' ? 'video' : 'audio'} call`;

  try {
    await dbAsync.run(
      `INSERT INTO conversations (id, user1_id, user2_id, updated_at) 
       VALUES (?, ?, ?, ?) 
       ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`,
      [convId, Math.min(callerId, targetId), Math.max(callerId, targetId), now]
    );

    await dbAsync.run(
      `INSERT INTO messages (id, conversation_id, sender_id, recipient_id, text, created_at) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [msgId, convId, callerId, targetId, text, now]
    );

    const msgPayload = {
      id: msgId,
      conversationId: convId,
      conversation_id: convId,
      senderId: callerId,
      sender_id: callerId,
      senderName: callerName,
      recipientId: targetId,
      recipient_id: targetId,
      text,
      isUnsent: 0,
      is_unsent: 0,
      is_read: 0,
      createdAt: now,
      created_at: now
    };

    if (onlineUsers.has(targetId)) {
      onlineUsers.get(targetId)!.forEach((sockId) => {
        io.to(sockId).emit('new_message', msgPayload);
      });
    }
    onlineUsers.get(callerId)?.forEach((sockId) => {
      io.to(sockId).emit('new_message', msgPayload);
    });

    sendPushToUser(targetId, {
      title: 'Missed Call',
      body: `Missed ${callType} call from ${callerName}`,
      type: 'message',
      data: { conversationId: convId, senderId: callerId }
    });
  } catch (err) {
    console.error('Error in recordMissedCall:', err);
  }
}

// Socket.io Presence & Real-time Delivery
const onlineUsers = new Map<number, Set<string>>();
const activeCalls = new Map<number, number>();

interface PendingCall {
  callerId: number;
  callerName: string;
  callType: 'audio' | 'video';
  timeoutId: NodeJS.Timeout;
}
const pendingCalls = new Map<number, PendingCall>();

io.use((socket: Socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication required'));

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return next(new Error('Invalid token'));
    (socket as any).user = user;
    next();
  });
});

io.on('connection', (socket: Socket) => {
  const user = (socket as any).user;
  const userId: number = user.id;

  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set());
  }
  onlineUsers.get(userId)!.add(socket.id);

  socket.broadcast.emit('user_presence', { userId, isOnline: true });

  // If this user has a pending incoming call waiting for them to open the app / connect:
  if (pendingCalls.has(userId)) {
    const pending = pendingCalls.get(userId)!;
    if (activeCalls.get(pending.callerId) === userId && onlineUsers.has(pending.callerId)) {
      socket.emit('incoming_call', {
        callerId: pending.callerId,
        callerName: pending.callerName,
        callType: pending.callType
      });
      onlineUsers.get(pending.callerId)!.forEach((sockId) => {
        io.to(sockId).emit('call_status', {
          status: 'node_woken',
          message: `${user.name} uplink connected. Ringing...`
        });
      });
    } else {
      clearTimeout(pending.timeoutId);
      pendingCalls.delete(userId);
    }
  }

  // Send & Persist Text Message with Zod Validation
  socket.on('send_message', async (data) => {
    const parse = SendMessageSchema.safeParse(data);
    if (!parse.success) return;

    const { recipientId, text, messageId } = parse.data;
    const convId = getConversationId(userId, recipientId);
    const now = Date.now();
    const id = messageId || `msg_${now}_${Math.random().toString(36).substr(2, 6)}`;

    try {
      await dbAsync.run(
        `INSERT INTO conversations (id, user1_id, user2_id, updated_at) 
         VALUES (?, ?, ?, ?) 
         ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`,
        [convId, Math.min(userId, recipientId), Math.max(userId, recipientId), now]
      );

      await dbAsync.run(
        `INSERT INTO messages (id, conversation_id, sender_id, recipient_id, text, created_at) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, convId, userId, recipientId, text, now]
      );

      const msgPayload = {
        id,
        conversationId: convId,
        conversation_id: convId,
        senderId: userId,
        sender_id: userId,
        senderName: user.name,
        recipientId,
        recipient_id: recipientId,
        text,
        isUnsent: 0,
        is_unsent: 0,
        is_read: 0,
        createdAt: now,
        created_at: now
      };

      if (onlineUsers.has(recipientId)) {
        onlineUsers.get(recipientId)!.forEach((sockId) => {
          io.to(sockId).emit('new_message', msgPayload);
        });
      }

      onlineUsers.get(userId)?.forEach((sockId) => {
        io.to(sockId).emit('new_message', msgPayload);
      });

      sendPushToUser(recipientId, {
        title: user.name,
        body: text,
        type: 'message',
        data: { conversationId: convId, senderId: userId }
      });
    } catch (err) {
      console.error('Failed to send text message:', err);
    }
  });

  // Ephemeral Live Media (1-day memory buffer, zero DB bloat)
  socket.on('send_media', async (data, callback) => {
    const targetId = Number(data.recipientId || data.mediaData?.recipientId);
    const mediaObj = data.mediaData || data;
    if (!targetId || !mediaObj) {
      if (typeof callback === 'function') callback({ error: 'Invalid payload' });
      return;
    }

    const convId = getConversationId(userId, targetId);
    const now = Date.now();
    const mediaId = data.id || `media_${now}_${Math.random().toString(36).substr(2, 6)}`;

    const payload: EphemeralMedia = {
      id: mediaId,
      type: mediaObj.type || 'file',
      dataUrl: mediaObj.dataUrl,
      fileName: mediaObj.fileName,
      fileSize: mediaObj.fileSize,
      mimeType: mediaObj.mimeType,
      conversationId: convId,
      conversation_id: convId,
      senderId: userId,
      sender_id: userId,
      senderName: user.name,
      recipientId: targetId,
      recipient_id: targetId,
      createdAt: now,
      created_at: now,
      isUnsent: 0,
      is_unsent: 0
    };

    // Store in 24-hour ephemeral cache
    if (!ephemeralMediaCache.has(convId)) {
      ephemeralMediaCache.set(convId, []);
    }
    const list = ephemeralMediaCache.get(convId)!;
    list.push(payload);
    // Purge media older than 24h
    const cutoff24 = now - ONE_DAY_MS;
    ephemeralMediaCache.set(convId, list.filter(m => m.created_at >= cutoff24));

    // Update conversation record in DB so it exists in sidebar
    try {
      await dbAsync.run(
        `INSERT INTO conversations (id, user1_id, user2_id, updated_at) 
         VALUES (?, ?, ?, ?) 
         ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`,
        [convId, Math.min(userId, targetId), Math.max(userId, targetId), now]
      );
    } catch (err) {
      console.error('Failed to update conversation on media send:', err);
    }

    if (onlineUsers.has(targetId)) {
      onlineUsers.get(targetId)!.forEach((sockId) => {
        io.to(sockId).emit('new_media', payload);
      });
    }

    onlineUsers.get(userId)?.forEach((sockId) => {
      if (sockId !== socket.id) {
        io.to(sockId).emit('new_media', payload);
      }
    });

    if (typeof callback === 'function') {
      callback({ success: true, id: mediaId });
    }

    const mediaLabels: Record<string, string> = {
      image: 'Transmitted photo 📷',
      video: 'Transmitted optical feed 🎥',
      audio: 'Transmitted neural voice note 🎙️',
      file: `Transmitted document: ${mediaObj.fileName || 'file'} 📎`,
      gif: 'Transmitted animated GIF ✨'
    };

    sendPushToUser(targetId, {
      title: user.name,
      body: mediaLabels[mediaObj.type] || 'Transmitted an encrypted payload 📎',
      type: 'message',
      data: { conversationId: convId, senderId: userId }
    });
  });

  // Unsend Mechanism for Text and Media
  socket.on('unsend_message', async (data) => {
    const parse = UnsendMessageSchema.safeParse(data);
    if (!parse.success) return;

    const { messageId, conversationId, recipientId } = parse.data;
    const targetId = Number(recipientId);

    try {
      await dbAsync.run(
        'UPDATE messages SET is_unsent = 1, text = "[This message was unsent]" WHERE id = ? AND sender_id = ?',
        [messageId, userId]
      );

      // Unsend in ephemeral media cache as well
      if (ephemeralMediaCache.has(conversationId)) {
        const mediaList = ephemeralMediaCache.get(conversationId)!;
        mediaList.forEach((m) => {
          if (m.id === messageId) {
            m.isUnsent = 1;
            m.is_unsent = 1;
            m.dataUrl = '';
          }
        });
      }

      const payload = { messageId, conversationId, byUserId: userId };

      if (onlineUsers.has(targetId)) {
        onlineUsers.get(targetId)!.forEach((sockId) => {
          io.to(sockId).emit('message_unsent', payload);
        });
      }
      onlineUsers.get(userId)?.forEach((sockId) => {
        io.to(sockId).emit('message_unsent', payload);
      });
    } catch (err) {
      console.error('Failed to unsend message:', err);
    }
  });

  socket.on('message_reaction', ({ messageId, conversationId, recipientId, emoji }) => {
    const targetId = Number(recipientId);
    const payload = { messageId, conversationId, emoji, fromUserId: userId };
    if (onlineUsers.has(targetId)) {
      onlineUsers.get(targetId)!.forEach((sockId) => {
        io.to(sockId).emit('message_reaction', payload);
      });
    }
    onlineUsers.get(userId)?.forEach((sockId) => {
      io.to(sockId).emit('message_reaction', payload);
    });
  });

  // Seen / Read Receipt Mechanism
  socket.on('mark_seen', async ({ conversationId, peerId }) => {
    const targetPeerId = Number(peerId);
    try {
      await dbAsync.run(
        'UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND recipient_id = ?',
        [conversationId, userId]
      );

      if (onlineUsers.has(targetPeerId)) {
        onlineUsers.get(targetPeerId)!.forEach((sockId) => {
          io.to(sockId).emit('messages_seen', { conversationId, byUserId: userId });
        });
      }
    } catch (err) {
      console.error('Error marking messages as seen:', err);
    }
  });

  socket.on('typing', ({ recipientId, isTyping, conversationId }) => {
    const targetId = Number(recipientId);
    if (onlineUsers.has(targetId)) {
      onlineUsers.get(targetId)!.forEach((sockId) => {
        io.to(sockId).emit('user_typing', { fromUserId: userId, conversationId, isTyping });
      });
    }
  });

  // WebRTC Calling Relay with background push wake-up and robust cancellation
  socket.on('call_request', async ({ targetUserId, callType }) => {
    const target = Number(targetUserId);

    if (activeCalls.has(userId)) {
      socket.emit('call_failed', { reason: 'Channel busy (already on an active uplink)' });
      return;
    }
    if (activeCalls.has(target) || pendingCalls.has(target)) {
      socket.emit('call_failed', { reason: 'Operative node busy on another channel' });
      return;
    }

    const isTargetOnline = onlineUsers.has(target) && (onlineUsers.get(target)?.size || 0) > 0;

    activeCalls.set(userId, target);
    activeCalls.set(target, userId);

    sendPushToUser(target, {
      title: `Incoming ${callType === 'video' ? 'Video' : 'Audio'} Uplink`,
      body: `${user.name} is initiating neural uplink...`,
      type: 'call',
      data: { callerId: userId, callerName: user.name, callType, targetUserId: target }
    });

    const timeoutId = setTimeout(async () => {
      if (pendingCalls.has(target) && pendingCalls.get(target)?.callerId === userId) {
        const pending = pendingCalls.get(target)!;
        pendingCalls.delete(target);
        activeCalls.delete(userId);
        activeCalls.delete(target);

        socket.emit('call_failed', { reason: 'Missed call (no answer)' });

        if (onlineUsers.has(target)) {
          onlineUsers.get(target)!.forEach((sockId) => {
            io.to(sockId).emit('call_ended', { byUserId: userId });
          });
        }
        sendPushToUser(target, { type: 'call_cancelled' });

        await recordMissedCall(userId, target, user.name, pending.callType);
      }
    }, 30000);

    pendingCalls.set(target, {
      callerId: userId,
      callerName: user.name,
      callType,
      timeoutId
    });

    if (isTargetOnline) {
      onlineUsers.get(target)!.forEach((sockId) => {
        io.to(sockId).emit('incoming_call', {
          callerId: userId,
          callerName: user.name,
          callType
        });
      });
    } else {
      socket.emit('call_status', {
        status: 'ringing_offline_node',
        message: 'Operative in standby mode. Push signal dispatched to wake device...'
      });
    }
  });

  socket.on('call_response', ({ callerId, accepted }) => {
    const target = Number(callerId) || activeCalls.get(userId);

    if (pendingCalls.has(userId)) {
      clearTimeout(pendingCalls.get(userId)!.timeoutId);
      pendingCalls.delete(userId);
    }
    sendPushToUser(userId, { type: 'call_cancelled' });

    if (!accepted) {
      activeCalls.delete(userId);
      if (target) activeCalls.delete(target);
      if (target && onlineUsers.has(target)) {
        onlineUsers.get(target)!.forEach((sockId) => {
          io.to(sockId).emit('call_response', {
            responderId: userId,
            responderName: user.name,
            accepted: false
          });
          io.to(sockId).emit('call_ended', { byUserId: userId });
        });
      }
    } else {
      if (target && onlineUsers.has(target)) {
        onlineUsers.get(target)!.forEach((sockId) => {
          io.to(sockId).emit('call_response', {
            responderId: userId,
            responderName: user.name,
            accepted: true
          });
        });
      }
    }
  });

  socket.on('webrtc_signal', ({ targetUserId, signal, callType }) => {
    const target = Number(targetUserId);
    if (onlineUsers.has(target)) {
      onlineUsers.get(target)!.forEach((sockId) => {
        io.to(sockId).emit('webrtc_signal', {
          senderId: userId,
          signal,
          callType
        });
      });
    }
  });

  socket.on('call_end', async ({ targetUserId }) => {
    const target = Number(targetUserId) || activeCalls.get(userId);
    activeCalls.delete(userId);
    if (target) {
      activeCalls.delete(target);
      if (pendingCalls.has(target) && pendingCalls.get(target)?.callerId === userId) {
        const pending = pendingCalls.get(target)!;
        clearTimeout(pending.timeoutId);
        pendingCalls.delete(target);
        await recordMissedCall(userId, target, user.name, pending.callType);
      } else if (pendingCalls.has(target)) {
        clearTimeout(pendingCalls.get(target)!.timeoutId);
        pendingCalls.delete(target);
      }
      sendPushToUser(target, { type: 'call_cancelled' });
    }
    if (pendingCalls.has(userId)) {
      clearTimeout(pendingCalls.get(userId)!.timeoutId);
      pendingCalls.delete(userId);
    }
    sendPushToUser(userId, { type: 'call_cancelled' });

    if (target && onlineUsers.has(target)) {
      onlineUsers.get(target)!.forEach((sockId) => {
        io.to(sockId).emit('call_ended', { byUserId: userId });
      });
    }
  });

  socket.on('disconnect', async () => {
    const peerId = activeCalls.get(userId);
    if (peerId) {
      activeCalls.delete(userId);
      activeCalls.delete(peerId);
      if (pendingCalls.has(peerId) && pendingCalls.get(peerId)?.callerId === userId) {
        const pending = pendingCalls.get(peerId)!;
        clearTimeout(pending.timeoutId);
        pendingCalls.delete(peerId);
        await recordMissedCall(userId, peerId, user.name, pending.callType);
      } else if (pendingCalls.has(peerId)) {
        clearTimeout(pendingCalls.get(peerId)!.timeoutId);
        pendingCalls.delete(peerId);
      }
      sendPushToUser(peerId, { type: 'call_cancelled' });

      if (onlineUsers.has(peerId)) {
        onlineUsers.get(peerId)!.forEach((sockId) => {
          io.to(sockId).emit('call_ended', { byUserId: userId });
        });
      }
    }
    if (pendingCalls.has(userId)) {
      clearTimeout(pendingCalls.get(userId)!.timeoutId);
      pendingCalls.delete(userId);
    }
    sendPushToUser(userId, { type: 'call_cancelled' });

    if (onlineUsers.has(userId)) {
      onlineUsers.get(userId)!.delete(socket.id);
      if (onlineUsers.get(userId)!.size === 0) {
        onlineUsers.delete(userId);
        socket.broadcast.emit('user_presence', { userId, isOnline: false });
      }
    }
  });
});

// Wildcard fallback to index.html for SPA routing
app.get('*', (_req: Request, res: Response) => {
  const distIndex = path.join(distPath, 'index.html');
  res.sendFile(distIndex);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`NEXUS React/TS/Zod server running on http://localhost:${PORT}`);
  initRetentionCron();
});

