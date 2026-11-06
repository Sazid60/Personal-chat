import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Toaster } from './components/ui/sonner';
import { cyberToast } from './cyberToast';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './components/ui/card';
import { Label } from './components/ui/label';
import {
  Atom,
  Radio,
  Phone,
  Video,
  Send,
  Mic,
  Paperclip,
  Search,
  Trash2,
  LogOut,
  ChevronDown,
  CheckCheck,
  Ban,
  Volume2,
  Volume1,
  ArrowLeft,
  X,
  ChevronUp,
  Plus,
  Crosshair,
  Headset,
  Fingerprint,
  Image as ImageIcon,
  FileText,
  User as UserIcon,
  PhoneOff,
  Smile,
  SmilePlus,
  Sparkles,
  Download,
  Smartphone,
  Laptop
} from 'lucide-react';
import { User, Conversation, Message, MediaMessage } from './types';
import { ClientLoginSchema, ClientRegisterSchema } from './validators';
import { WebRTCManager } from './lib/webrtc';

export function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('cipherchat_jwt'));
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Auth Form State
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginErrors, setLoginErrors] = useState<Record<string, string>>({});

  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regErrors, setRegErrors] = useState<Record<string, string>>({});

  // Chat Data State
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<(Message | MediaMessage)[]>([]);
  const [messageText, setMessageText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const earliestTimestampRef = useRef<number | null>(null);

  // Global & In-Chat Search State
  const [globalSearch, setGlobalSearch] = useState('');
  const [searchedUsers, setSearchedUsers] = useState<User[]>([]);
  const [showInChatSearch, setShowInChatSearch] = useState(false);
  const [inChatSearchQuery, setInChatSearchQuery] = useState('');
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [matchCount, setMatchCount] = useState(0);

  // Call & Media State
  const [activeCall, setActiveCall] = useState<{ callType: 'audio' | 'video'; targetUserId: number; name: string; status?: 'outgoing' | 'connected' } | null>(null);
  const [incomingCall, setIncomingCall] = useState<{ callerId: number; callerName: string; callType: 'audio' | 'video' } | null>(null);
  const [callSeconds, setCallSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isLoud, setIsLoud] = useState(false);
  const isLoudRef = useRef(false);

  // Modals & Popups
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [newChatSearchInput, setNewChatSearchInput] = useState('');
  const [newChatResults, setNewChatResults] = useState<User[]>([]);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [reactions, setReactions] = useState<Record<string, string[]>>({});
  const [activeReactionMenuId, setActiveReactionMenuId] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifModal, setShowGifModal] = useState(false);
  const [gifSearchInput, setGifSearchInput] = useState('');
  const [gifs, setGifs] = useState<string[]>([]);
  const [isLoadingGifs, setIsLoadingGifs] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallGuide, setShowInstallGuide] = useState(false);

  // Mobile View
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  // Refs
  const socketRef = useRef<Socket | null>(null);
  const webrtcRef = useRef<WebRTCManager | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const typingTimeoutRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioCallRingtoneRef = useRef<HTMLAudioElement | null>(null);
  const videoCallRingtoneRef = useRef<HTMLAudioElement | null>(null);
  const messageToneRef = useRef<HTMLAudioElement | null>(null);

  const playRingtone = (callType: 'audio' | 'video' = 'audio') => {
    stopRingtone();
    try {
      const el = callType === 'video' ? videoCallRingtoneRef.current : audioCallRingtoneRef.current;
      if (el) {
        el.volume = 0.5;
        el.currentTime = 0;
        el.play().catch(() => {});
      }
    } catch (_) {}
  };

  const stopRingtone = () => {
    try {
      if (audioCallRingtoneRef.current) {
        audioCallRingtoneRef.current.pause();
        audioCallRingtoneRef.current.currentTime = 0;
      }
      if (videoCallRingtoneRef.current) {
        videoCallRingtoneRef.current.pause();
        videoCallRingtoneRef.current.currentTime = 0;
      }
    } catch (_) {}
  };

  const audioCtxRef = useRef<AudioContext | null>(null);

  const getAudioContext = () => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  };

  const playMessageTone = () => {
    // 1. Soothing 3-tone crystal harp arpeggio via Web Audio API (zero harshness)
    try {
      const ctx = getAudioContext();
      if (ctx) {
        const now = ctx.currentTime;
        // Soft triad arpeggio: F5 (698.46 Hz) -> A5 (880.00 Hz) -> C6 (1046.50 Hz)
        const notes = [
          { freq: 698.46, start: 0.00, dur: 0.35, vol: 0.16 },
          { freq: 880.00, start: 0.07, dur: 0.38, vol: 0.18 },
          { freq: 1046.50, start: 0.14, dur: 0.45, vol: 0.22 },
        ];
        notes.forEach(({ freq, start, dur, vol }) => {
          const osc = ctx.createOscillator();
          const gainNode = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + start);

          gainNode.gain.setValueAtTime(0.0001, now + start);
          gainNode.gain.exponentialRampToValueAtTime(vol, now + start + 0.012);
          gainNode.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);

          osc.connect(gainNode);
          gainNode.connect(ctx.destination);

          osc.start(now + start);
          osc.stop(now + start + dur);
        });
        return;
      }
    } catch (_) {}

    // 2. Fallback to HTML Audio element
    try {
      if (messageToneRef.current) {
        messageToneRef.current.volume = 0.45;
        messageToneRef.current.currentTime = 0;
        messageToneRef.current.play().catch(() => {});
      }
    } catch (_) {}
  };

  const activeConvRef = useRef<Conversation | null>(activeConv);
  const activeCallRef = useRef<any>(activeCall);
  const currentCallPeerIdRef = useRef<number | null>(null);
  const isEndingCallRef = useRef<boolean>(false);
  const autoAcceptOnIncomingRef = useRef<boolean>(false);
  const autoDeclineOnIncomingRef = useRef<boolean>(false);
  const acceptIncomingCallRef = useRef<((direct?: any) => Promise<void>) | null>(null);
  const declineIncomingCallRef = useRef<((directCallerId?: number) => void) | null>(null);

  useEffect(() => {
    activeConvRef.current = activeConv;
  }, [activeConv]);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  // Synchronize media elements whenever activeCall or streams update
  useEffect(() => {
    if (activeCall && webrtcRef.current) {
      if (webrtcRef.current.localStream && localVideoRef.current && activeCall.callType === 'video') {
        localVideoRef.current.srcObject = webrtcRef.current.localStream;
        localVideoRef.current.play().catch(() => {});
      }
      if (webrtcRef.current.remoteStream) {
        if (activeCall.callType === 'audio') {
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = webrtcRef.current.remoteStream;
            remoteAudioRef.current.volume = isLoudRef.current ? 1.0 : 0.4;
            remoteAudioRef.current.play().catch(() => {});
          }
        } else {
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = null;
          }
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = webrtcRef.current.remoteStream;
            remoteVideoRef.current.volume = isLoudRef.current ? 1.0 : 0.8;
            remoteVideoRef.current.play().catch(() => {});
          }
        }
      }
    }
  }, [activeCall?.status, activeCall?.callType]);

  // Listen for PWA install prompt
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice?.outcome === 'accepted') {
          cyberToast.success('NEXUS App installed successfully', 'PWA_OK');
        }
        setDeferredPrompt(null);
      } catch (_) {
        setShowInstallGuide(true);
      }
    } else {
      setShowInstallGuide(true);
    }
  };

  const renderInstallGuideModal = () => {
    if (!showInstallGuide) return null;
    return (
      <div className="modal-overlay" onClick={() => setShowInstallGuide(false)}>
        <div className="card modal-content install-guide-card" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title-wrap">
              <Download className="text-[#00f0ff]" size={20} />
              <h3 className="modal-title">DOWNLOAD NEXUS APP</h3>
            </div>
            <button
              className="modal-close-btn"
              onClick={() => setShowInstallGuide(false)}
            >
              <X size={18} />
            </button>
          </div>

          <div className="install-guide-body">
            <p className="install-guide-lead">
              Install NEXUS directly on your device for instant launch, background incoming call alerts, and full screen secure comms.
            </p>

            <div className="install-platform-list">
              <div className="platform-card">
                <div className="platform-icon">
                  <Smartphone size={22} className="text-[#00f0ff]" />
                </div>
                <div className="platform-info">
                  <h4>Android (Chrome / Edge)</h4>
                  <p>Tap menu <strong>⋮</strong> at top-right, then select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</p>
                </div>
              </div>

              <div className="platform-card">
                <div className="platform-icon">
                  <Smartphone size={22} className="text-[#a78bfa]" />
                </div>
                <div className="platform-info">
                  <h4>iPhone / iPad (Safari)</h4>
                  <p>Tap the <strong>Share</strong> button (⎋) at the bottom, then tap <strong>"Add to Home Screen" (+)</strong>.</p>
                </div>
              </div>

              <div className="platform-card">
                <div className="platform-icon">
                  <Laptop size={22} className="text-[#38bdf8]" />
                </div>
                <div className="platform-info">
                  <h4>Desktop (Chrome / Edge / Windows / Mac)</h4>
                  <p>Click the <strong>Install</strong> icon in the address bar (⤓ or ⊕), or menu <strong>⋮ → "Install NEXUS"</strong>.</p>
                </div>
              </div>
            </div>

            {deferredPrompt && (
              <button
                type="button"
                className="btn btn-primary btn-block install-trigger-btn"
                onClick={() => {
                  deferredPrompt.prompt();
                  setShowInstallGuide(false);
                }}
              >
                <Download size={16} /> Tap to Launch Install Prompt
              </button>
            )}
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowInstallGuide(false)}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Handle URL query parameters and service worker messages for incoming calls
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const callAction = urlParams.get('call_action');
    if (callAction) {
      window.history.replaceState({}, document.title, window.location.pathname);
      if (callAction === 'accept') {
        autoAcceptOnIncomingRef.current = true;
      } else if (callAction === 'decline') {
        autoDeclineOnIncomingRef.current = true;
      }
    }

    const handleSwMessage = (e: MessageEvent) => {
      if (e.data?.type === 'NOTIFICATION_ACTION') {
        const { action, data } = e.data;
        if (action === 'accept' && data?.callerId) {
          acceptIncomingCallRef.current?.({
            callerId: Number(data.callerId),
            callerName: data.callerName || 'Operative',
            callType: data.callType || 'audio'
          });
        } else if (action === 'decline' && data?.callerId) {
          declineIncomingCallRef.current?.(Number(data.callerId));
        }
      }
    };

    navigator.serviceWorker?.addEventListener('message', handleSwMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleSwMessage);
    };
  }, []);

  // Verify Session
  useEffect(() => {
    if (!token) return;
    fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error('Unauthorized');
        const text = await res.text();
        return text ? JSON.parse(text) : {};
      })
      .then((data) => {
        if (data && data.user) {
          setCurrentUser(data.user);
        } else {
          throw new Error('No user data');
        }
      })
      .catch(() => {
        localStorage.removeItem('cipherchat_jwt');
        setToken(null);
      });
  }, [token]);

  // Connect Socket & PWA Registration
  useEffect(() => {
    if (!currentUser || !token) return;

    registerPWA();

    const socket = io({ auth: { token } });
    socketRef.current = socket;

    const webrtc = new WebRTCManager(socket);
    webrtcRef.current = webrtc;

    webrtc.onLocalStreamCallback = (stream, callType) => {
      if (localVideoRef.current && callType === 'video') {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }
    };
    webrtc.onRemoteStreamCallback = (stream, callType) => {
      if (callType === 'audio') {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = stream;
          remoteAudioRef.current.volume = isLoudRef.current ? 1.0 : 0.4;
          remoteAudioRef.current.play().catch((e) => console.warn('Audio play error:', e));
        }
      } else {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = null;
        }
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
          remoteVideoRef.current.volume = isLoudRef.current ? 1.0 : 0.8;
          remoteVideoRef.current.play().catch((e) => console.warn('Video play error:', e));
        }
      }
    };
    webrtc.onCallEndCallback = () => {
      endCall(false);
    };

    socket.on('user_presence', ({ userId, isOnline }) => {
      setConversations((prev) =>
        prev.map((c) => (c.peer_id === userId ? { ...c, isOnline } : c))
      );
      if (activeConvRef.current && activeConvRef.current.peer_id === userId) {
        setActiveConv((prev) => prev ? { ...prev, isOnline } : null);
      }
    });

    socket.on('new_message', (raw: any) => {
      const msg: Message = {
        id: raw.id,
        conversation_id: raw.conversation_id || raw.conversationId,
        sender_id: raw.sender_id || raw.senderId,
        recipient_id: raw.recipient_id || raw.recipientId,
        text: raw.text,
        is_unsent: raw.is_unsent ?? raw.isUnsent ?? 0,
        is_read: raw.is_read ?? 0,
        created_at: raw.created_at || raw.createdAt || Date.now()
      };

      if (msg.sender_id !== currentUser.id) {
        playMessageTone();
        if ('vibrate' in navigator) navigator.vibrate([80, 40, 80]);
      }

      const currentActive = activeConvRef.current;
      if (currentActive && (msg.conversation_id === currentActive.id)) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        scrollToBottom();

        if (msg.sender_id !== currentUser.id) {
          socketRef.current?.emit('mark_seen', {
            conversationId: msg.conversation_id,
            peerId: Number(msg.sender_id)
          });
        }
      }

      setConversations((prev) => {
        const found = prev.find((c) => c.id === msg.conversation_id);
        const lastMsg = {
          id: msg.id,
          text: msg.text,
          is_unsent: msg.is_unsent,
          sender_id: msg.sender_id,
          created_at: msg.created_at
        };

        if (!found) {
          const newConv: Conversation = {
            id: msg.conversation_id,
            peer_id: msg.sender_id,
            peer_name: raw.senderName || 'Transmitting Node',
            peer_email: '',
            peer_phone: '',
            updated_at: msg.created_at,
            isOnline: true,
            lastMessage: lastMsg
          };
          return [newConv, ...prev];
        }

        const updated = {
          ...found,
          updated_at: msg.created_at,
          lastMessage: lastMsg
        };
        return [updated, ...prev.filter((c) => c.id !== msg.conversation_id)];
      });
    });

    socket.on('new_media', (raw: any) => {
      const mediaMsg: MediaMessage = {
        id: raw.id,
        type: raw.type,
        dataUrl: raw.dataUrl,
        fileName: raw.fileName,
        fileSize: raw.fileSize,
        mimeType: raw.mimeType,
        conversation_id: raw.conversation_id || raw.conversationId,
        conversationId: raw.conversation_id || raw.conversationId,
        sender_id: raw.sender_id || raw.senderId,
        senderId: raw.sender_id || raw.senderId,
        recipient_id: raw.recipient_id || raw.recipientId,
        recipientId: raw.recipient_id || raw.recipientId,
        is_unsent: raw.is_unsent ?? raw.isUnsent ?? 0,
        is_read: raw.is_read ?? 0,
        created_at: raw.created_at || raw.createdAt || Date.now(),
        createdAt: raw.created_at || raw.createdAt || Date.now()
      };

      const convId = mediaMsg.conversation_id!;
      if (mediaMsg.sender_id !== currentUser.id) {
        playMessageTone();
        if ('vibrate' in navigator) navigator.vibrate([80, 40, 80]);
      }

      const currentActive = activeConvRef.current;
      if (currentActive && convId === currentActive.id) {
        setMessages((prev) => {
          if (prev.some((m) => (m as any).id === mediaMsg.id)) return prev;
          return [...prev, mediaMsg];
        });
        scrollToBottom();

        if (mediaMsg.sender_id !== currentUser.id) {
          socketRef.current?.emit('mark_seen', {
            conversationId: convId,
            peerId: Number(mediaMsg.sender_id)
          });
        }
      }

      setConversations((prev) => {
        const found = prev.find((c) => c.id === convId);
        const lastSnippet = mediaMsg.type === 'image' ? '📷 Photo'
          : mediaMsg.type === 'video' ? '🎥 Video'
          : mediaMsg.type === 'audio' ? '🎙️ Voice note'
          : mediaMsg.type === 'gif' ? '✨ GIF'
          : `📎 ${mediaMsg.fileName || 'Document'}`;

        const lastMsg = {
          id: mediaMsg.id,
          text: lastSnippet,
          is_unsent: 0,
          sender_id: mediaMsg.sender_id,
          created_at: mediaMsg.created_at
        };

        if (!found) {
          const newConv: Conversation = {
            id: convId,
            peer_id: mediaMsg.sender_id,
            peer_name: raw.senderName || 'Transmitting Node',
            peer_email: '',
            peer_phone: '',
            updated_at: mediaMsg.created_at,
            isOnline: true,
            lastMessage: lastMsg
          };
          return [newConv, ...prev];
        }

        const updated = {
          ...found,
          updated_at: mediaMsg.created_at,
          lastMessage: lastMsg
        };
        return [updated, ...prev.filter((c) => c.id !== convId)];
      });
    });

    socket.on('message_unsent', ({ messageId, conversationId }) => {
      setMessages((prev) =>
        prev.map((m) =>
          ((m as any).id === messageId
            ? { ...m, is_unsent: 1, isUnsent: 1, text: '🚫 This message was unsent', dataUrl: '' }
            : m)
        )
      );
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId && c.lastMessage?.id === messageId
            ? { ...c, lastMessage: { ...c.lastMessage, is_unsent: 1, text: '🚫 This message was unsent' } }
            : c
        )
      );
    });

    socket.on('messages_seen', ({ conversationId }) => {
      setMessages((prev) =>
        prev.map((m) =>
          (m.conversation_id === conversationId || (m as any).conversationId === conversationId)
            ? { ...m, is_read: 1 }
            : m
        )
      );
    });

    socket.on('message_reaction', ({ messageId, emoji }: any) => {
      setReactions((prev) => {
        const list = prev[messageId] || [];
        return { ...prev, [messageId]: list.includes(emoji) ? list : [...list, emoji] };
      });
    });

    socket.on('user_typing', ({ fromUserId, isTyping }) => {
      if (activeConvRef.current && activeConvRef.current.peer_id === fromUserId) {
        setPeerTyping(isTyping);
      }
    });

    socket.on('call_status', ({ message }: any) => {
      if (message) cyberToast.info(message, 'SIG_STATUS');
    });

    socket.on('incoming_call', ({ callerId, callerName, callType }) => {
      currentCallPeerIdRef.current = Number(callerId);

      // Handle immediate auto-response from notification action
      if (autoAcceptOnIncomingRef.current) {
        autoAcceptOnIncomingRef.current = false;
        acceptIncomingCallRef.current?.({ callerId: Number(callerId), callerName, callType });
        return;
      }
      if (autoDeclineOnIncomingRef.current) {
        autoDeclineOnIncomingRef.current = false;
        declineIncomingCallRef.current?.(Number(callerId));
        return;
      }

      setIncomingCall({ callerId, callerName, callType });
      playRingtone(callType);
      try {
        if ('vibrate' in navigator) {
          navigator.vibrate([400, 200, 400, 200, 400]);
        }
      } catch (_) {}
    });

    socket.on('call_response', async ({ responderId, responderName, accepted, callType }: any) => {
      stopRingtone();
      if ('vibrate' in navigator) navigator.vibrate(0);
      if (accepted) {
        cyberToast.success(`${responderName || 'Operative'} bridged neural uplink.`, 'ACK_UPLINK');
        setActiveCall((prev) => prev ? { ...prev, status: 'connected' } : null);
        try {
          const targetId = Number(responderId || currentCallPeerIdRef.current || activeCallRef.current?.targetUserId);
          const type = callType || activeCallRef.current?.callType || 'audio';
          if (targetId) {
            await webrtcRef.current?.startCall(targetId, type);
          }
        } catch (err: any) {
          cyberToast.error('WebRTC uplink initialization error: ' + err.message, 'ERR_MEDIA');
          endCall(true);
        }
      } else {
        setActiveCall(null);
        setIncomingCall(null);
        currentCallPeerIdRef.current = null;
        try { webrtcRef.current?.endCall(false); } catch (_) {}
        cyberToast.error(`${responderName || 'Operative'} declined uplink.`, 'ERR_DECLINED');
      }
    });

    socket.on('call_failed', ({ reason }: any) => {
      stopRingtone();
      if ('vibrate' in navigator) navigator.vibrate(0);
      setActiveCall(null);
      setIncomingCall(null);
      currentCallPeerIdRef.current = null;
      try { webrtcRef.current?.endCall(false); } catch (_) {}
      cyberToast.error(reason || 'Operative node offline', 'ERR_OFFLINE');
    });

    socket.on('webrtc_signal', async (data) => {
      await webrtcRef.current?.handleIncomingSignal(data);
    });

    socket.on('call_ended', () => {
      stopRingtone();
      if ('vibrate' in navigator) navigator.vibrate(0);
      setActiveCall(null);
      setIncomingCall(null);
      currentCallPeerIdRef.current = null;
      try { webrtcRef.current?.endCall(false); } catch (_) {}
      cyberToast.info('Neural frequency terminated', 'SIG_TERM');
    });

    loadConversations();

    return () => {
      socket.disconnect();
    };
  }, [currentUser?.id, token]);

  // Load Conversations
  const loadConversations = async () => {
    try {
      const res = await fetch('/api/conversations', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return;
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      setConversations(data.conversations || []);
    } catch (_) {}
  };

  // PWA & VAPID Registration
  const registerPWA = async () => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        const res = await fetch('/api/push/vapid-key');
        if (!res.ok) return;
        const text = await res.text();
        const data = text ? JSON.parse(text) : {};
        const publicKey = data.publicKey;
        if (!publicKey) return;

        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          const padding = '='.repeat((4 - (publicKey.length % 4)) % 4);
          const base64 = (publicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
          const raw = window.atob(base64);
          const appKey = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) appKey[i] = raw.charCodeAt(i);

          sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey });
        }

        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ subscription: sub })
        });
      } catch (_) {}
    }
  };

  const clearAppBadge = () => {
    if ('clearAppBadge' in navigator) (navigator as any).clearAppBadge().catch(() => {});
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_BADGE' });
    }
  };

  // Open Conversation
  const openConversation = async (conv: Conversation) => {
    setActiveConv(conv);
    activeConvRef.current = conv;
    setMobileChatOpen(true);
    setMessages([]);
    earliestTimestampRef.current = null;
    setHasMoreHistory(true);
    setShowInChatSearch(false);
    clearAppBadge();

    socketRef.current?.emit('mark_seen', {
      conversationId: conv.id,
      peerId: Number(conv.peer_id)
    });

    await fetchMessagesPage(conv.id);
    scrollToBottom();
  };

  // Paginated Scroll-Up
  const fetchMessagesPage = async (convId: string) => {
    if (isLoadingHistory || !hasMoreHistory) return;
    setIsLoadingHistory(true);

    const beforeParam = earliestTimestampRef.current ? `&before=${earliestTimestampRef.current}` : '';
    try {
      const res = await fetch(`/api/messages/${convId}?limit=30${beforeParam}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return;
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      const fetched: Message[] = data.messages || [];

      if (fetched.length < 30) setHasMoreHistory(false);
      if (fetched.length > 0) {
        earliestTimestampRef.current = fetched[0].created_at;
        setMessages((prev) => [...fetched, ...prev]);
      }
    } catch (_) {
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      if (messagesViewportRef.current) {
        messagesViewportRef.current.scrollTo({
          top: messagesViewportRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }
    }, 50);
  };

  // Auth Submit Handlers with Zod Validation
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginErrors({});
    const result = ClientLoginSchema.safeParse({ identifier: loginIdentifier.trim(), password: loginPassword });
    if (!result.success) {
      const errs: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        const field = (issue.path[0] as string) || 'identifier';
        if (!errs[field]) errs[field] = issue.message;
      });
      setLoginErrors(errs);
      cyberToast.error(result.error.issues[0]?.message || 'Input validation failed', 'ERR_INPUT');
      return;
    }

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.data)
      });
      
      let data: any = {};
      try {
        const raw = await res.text();
        data = raw ? JSON.parse(raw) : {};
      } catch (_) {
        data = { error: 'Node communication response error' };
      }

      if (!res.ok) {
        const errMsg = data.error || 'Authentication rejected';
        cyberToast.error(errMsg, 'ERR_AUTH');
        setLoginErrors({
          identifier: 'Invalid credentials. Check email or phone',
          password: 'Check neural keyphrase'
        });
        return;
      }

      localStorage.setItem('cipherchat_jwt', data.token);
      setToken(data.token);
      setCurrentUser(data.user);
      cyberToast.success(`Access granted: ${data.user.name}`, 'ACK_AUTH');
    } catch (err: any) {
      cyberToast.error(err.message || 'Network connection failed', 'ERR_NET');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegErrors({});
    const result = ClientRegisterSchema.safeParse({
      name: regName.trim(),
      email: regEmail.trim(),
      phone: regPhone.trim(),
      password: regPassword
    });
    if (!result.success) {
      const errs: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        const field = (issue.path[0] as string) || 'name';
        if (!errs[field]) errs[field] = issue.message;
      });
      setRegErrors(errs);
      cyberToast.error(result.error.issues[0]?.message || 'Input validation failed', 'ERR_INPUT');
      return;
    }

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.data)
      });

      let data: any = {};
      try {
        const raw = await res.text();
        data = raw ? JSON.parse(raw) : {};
      } catch (_) {
        data = { error: 'Node initialization response error' };
      }

      if (!res.ok) {
        const errMsg = data.error || 'Registration failed';
        cyberToast.error(errMsg, 'ERR_REG');
        if (errMsg.toLowerCase().includes('email')) {
          setRegErrors((p) => ({ ...p, email: errMsg }));
        } else if (errMsg.toLowerCase().includes('phone')) {
          setRegErrors((p) => ({ ...p, phone: errMsg }));
        }
        return;
      }

      localStorage.setItem('cipherchat_jwt', data.token);
      setToken(data.token);
      setCurrentUser(data.user);
      cyberToast.success('Node initialized & authenticated', 'ACK_INIT');
    } catch (err: any) {
      cyberToast.error(err.message || 'Network connection failed', 'ERR_NET');
    }
  };

  // Send Text Message
  const handleSendMessage = () => {
    const text = messageText.trim();
    if (!text || !activeConv || !currentUser) return;

    const tempId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const now = Date.now();
    const newMsg: Message = {
      id: tempId,
      conversation_id: activeConv.id,
      sender_id: currentUser.id,
      recipient_id: activeConv.peer_id,
      text,
      is_unsent: 0,
      created_at: now
    };

    // Immediate optimistic update to messages flow
    setMessages((prev) => [...prev, newMsg]);
    setMessageText('');
    setShowEmojiPicker(false);
    scrollToBottom();

    setConversations((prev) => {
      const found = prev.find((c) => c.id === activeConv.id);
      if (!found) return prev;
      const updated = {
        ...found,
        lastMessage: {
          id: tempId,
          text,
          is_unsent: 0,
          sender_id: currentUser.id,
          created_at: now
        }
      };
      return [updated, ...prev.filter((c) => c.id !== activeConv.id)];
    });

    socketRef.current?.emit('send_message', {
      recipientId: Number(activeConv.peer_id),
      text,
      messageId: tempId
    });

    socketRef.current?.emit('typing', {
      recipientId: activeConv.peer_id,
      conversationId: activeConv.id,
      isTyping: false
    });
  };

  // Reactions & GIF Handlers
  const handleSendReaction = (messageId: string, emoji: string) => {
    if (!activeConv) return;
    setReactions((prev) => {
      const list = prev[messageId] || [];
      if (list.includes(emoji)) return prev;
      return { ...prev, [messageId]: [...list, emoji] };
    });
    socketRef.current?.emit('message_reaction', {
      messageId,
      conversationId: activeConv.id,
      recipientId: activeConv.peer_id,
      emoji
    });
    setActiveReactionMenuId(null);
  };

  const loadGifs = async (query = 'cyberpunk') => {
    setIsLoadingGifs(true);
    try {
      const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=dc6zaTOxFJmzC&q=${encodeURIComponent(query || 'cyberpunk')}&limit=16`);
      const data = await res.json();
      const urls = (data.data || []).map((item: any) => item.images?.fixed_height?.url || item.images?.downsized?.url).filter(Boolean);
      setGifs(urls.length > 0 ? urls : [
        'https://media.giphy.com/media/Y4yWtyQtxMeJ8GlAiR/giphy.gif',
        'https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/giphy.gif',
        'https://media.giphy.com/media/ule4akeXnY9A50XDUS/giphy.gif',
        'https://media.giphy.com/media/hrBIFoyVZ9W5RpxddL/giphy.gif'
      ]);
    } catch (_) {
      setGifs([
        'https://media.giphy.com/media/Y4yWtyQtxMeJ8GlAiR/giphy.gif',
        'https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/giphy.gif',
        'https://media.giphy.com/media/ule4akeXnY9A50XDUS/giphy.gif',
        'https://media.giphy.com/media/hrBIFoyVZ9W5RpxddL/giphy.gif'
      ]);
    } finally {
      setIsLoadingGifs(false);
    }
  };

  const sendGif = (gifUrl: string) => {
    if (!activeConv || !currentUser) return;
    const mediaId = `media_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const mediaPayload: MediaMessage = {
      id: mediaId,
      type: 'gif',
      dataUrl: gifUrl,
      fileName: 'HoloGIF',
      conversationId: activeConv.id,
      senderId: currentUser.id,
      recipientId: activeConv.peer_id,
      is_unsent: 0,
      is_read: 0,
      createdAt: Date.now()
    };
    setMessages((prev) => [...prev, mediaPayload]);
    scrollToBottom();
    socketRef.current?.emit('send_media', {
      recipientId: Number(activeConv.peer_id),
      id: mediaId,
      mediaData: mediaPayload
    });
    setShowGifModal(false);
    cyberToast.success('Holographic GIF packet dispatched', 'ACK_GIF');
  };

  const toggleVoiceRecord = async () => {
    if (isRecordingVoice) {
      mediaRecorderRef.current?.stop();
      setIsRecordingVoice(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunksRef.current = [];
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop());
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.onloadend = () => {
            const dataUrl = reader.result as string;
            if (!activeConv || !currentUser) return;
            const mediaId = `media_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            const mediaPayload: MediaMessage = {
              id: mediaId,
              type: 'audio',
              dataUrl,
              fileName: `Audio_${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.webm`,
              conversationId: activeConv.id,
              senderId: currentUser.id,
              recipientId: activeConv.peer_id,
              is_unsent: 0,
              is_read: 0,
              createdAt: Date.now()
            };
            setMessages((prev) => [...prev, mediaPayload]);
            scrollToBottom();
            socketRef.current?.emit('send_media', {
              recipientId: Number(activeConv.peer_id),
              id: mediaId,
              mediaData: mediaPayload
            });
            cyberToast.success('Voice telemetry dispatched', 'ACK_VOICE');
          };
          reader.readAsDataURL(audioBlob);
        };

        recorder.start();
        setIsRecordingVoice(true);
        cyberToast.info('Recording audio frequency... Click mic to transmit', 'REC_START');
      } catch (err: any) {
        cyberToast.error('Mic access denied: ' + err.message, 'ERR_MIC');
      }
    }
  };

  // Unsend Message (Text & Ephemeral Media)
  const handleUnsend = (messageId: string) => {
    if (!activeConv) return;
    setMessages((prev) =>
      prev.map((m) =>
        ((m as any).id === messageId
          ? { ...m, is_unsent: 1, isUnsent: 1, text: '🚫 This message was unsent', dataUrl: '' }
          : m)
      )
    );
    socketRef.current?.emit('unsend_message', {
      messageId,
      conversationId: activeConv.id,
      recipientId: Number(activeConv.peer_id)
    });
  };

  // Delete Chat
  const confirmDeleteChat = async () => {
    if (!activeConv) return;
    setShowDeleteModal(false);

    try {
      const res = await fetch(`/api/conversations/${activeConv.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Purge failed');

      setConversations((prev) => prev.filter((c) => c.id !== activeConv.id));
      setActiveConv(null);
      setMobileChatOpen(false);
      cyberToast.success('Channel logs purged', 'ACK_PURGE');
    } catch (err: any) {
      cyberToast.error(err.message, 'ERR_PURGE');
    }
  };

  // Audio / Video Calls
  const startCall = (callType: 'audio' | 'video') => {
    if (!activeConv) return;
    const targetId = Number(activeConv.peer_id);
    currentCallPeerIdRef.current = targetId;

    const defaultLoud = callType === 'video';
    setIsLoud(defaultLoud);
    isLoudRef.current = defaultLoud;
    setIsVideoOff(callType === 'audio');

    const newCall = { callType, targetUserId: targetId, name: activeConv.peer_name, status: 'outgoing' as const };
    activeCallRef.current = newCall;
    setActiveCall(newCall);
    socketRef.current?.emit('call_request', { targetUserId: targetId, callType });
    cyberToast.info(`Calling ${activeConv.peer_name}...`, 'SIG_CALL');
  };

  const acceptIncomingCall = async (directCall?: { callerId: number; callerName: string; callType: 'audio' | 'video' } | React.MouseEvent) => {
    const callData = (directCall && 'callerId' in directCall) ? directCall : incomingCall;
    if (!callData) return;
    stopRingtone();
    if ('vibrate' in navigator) navigator.vibrate(0);

    const { callerId, callerName, callType } = callData;
    const peerId = Number(callerId);
    currentCallPeerIdRef.current = peerId;

    const defaultLoud = callType === 'video';
    setIsLoud(defaultLoud);
    isLoudRef.current = defaultLoud;
    setIsVideoOff(callType === 'audio');

    const newCall = { callType, targetUserId: peerId, name: callerName, status: 'connected' as const };
    activeCallRef.current = newCall;
    setActiveCall(newCall);
    socketRef.current?.emit('call_response', { callerId: peerId, accepted: true });
    setIncomingCall(null);

    try {
      await webrtcRef.current?.answerCall(peerId, callType);
    } catch (err: any) {
      cyberToast.error('Uplink hardware error: ' + err.message, 'ERR_CALL');
      endCall(true);
    }
  };
  acceptIncomingCallRef.current = acceptIncomingCall;

  const declineIncomingCall = (directCallerId?: number | React.MouseEvent) => {
    stopRingtone();
    if ('vibrate' in navigator) navigator.vibrate(0);

    const callerId = (typeof directCallerId === 'number') ? directCallerId : (incomingCall ? Number(incomingCall.callerId) : currentCallPeerIdRef.current);
    setIncomingCall(null);
    currentCallPeerIdRef.current = null;

    if (callerId) {
      socketRef.current?.emit('call_response', { callerId, accepted: false });
      socketRef.current?.emit('call_end', { targetUserId: callerId });
    }
  };
  declineIncomingCallRef.current = declineIncomingCall;

  const endCall = (notify = true) => {
    const target = currentCallPeerIdRef.current || activeCall?.targetUserId || activeCallRef.current?.targetUserId || incomingCall?.callerId || webrtcRef.current?.targetUserId;

    // Instantly dismiss call overlay & incoming alert on frame 0 -> returns straight to chat box
    setActiveCall(null);
    activeCallRef.current = null;
    setIncomingCall(null);
    currentCallPeerIdRef.current = null;

    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;

    stopRingtone();
    if ('vibrate' in navigator) navigator.vibrate(0);

    try {
      webrtcRef.current?.endCall(false);
    } catch (_) {}

    if (notify && target) {
      socketRef.current?.emit('call_end', { targetUserId: Number(target) });
    }
  };

  // Send Live Media (Ephemeral with unique ID for unsend capability)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeConv || !currentUser) return;

    const reader = new FileReader();
    reader.onload = () => {
      let type: MediaMessage['type'] = 'file';
      if (file.type.startsWith('image/')) type = 'image';
      else if (file.type.startsWith('video/')) type = 'video';
      else if (file.type.startsWith('audio/')) type = 'audio';

      const mediaId = `media_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const mediaPayload: MediaMessage = {
        id: mediaId,
        type,
        dataUrl: reader.result as string,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        conversationId: activeConv.id,
        senderId: currentUser.id,
        recipientId: activeConv.peer_id,
        is_unsent: 0,
        is_read: 0,
        createdAt: Date.now()
      };

      setMessages((prev) => [...prev, mediaPayload]);
      scrollToBottom();

      socketRef.current?.emit('send_media', {
        recipientId: Number(activeConv.peer_id),
        id: mediaId,
        mediaData: mediaPayload
      });
      cyberToast.success(`Transmitted ${file.name}`, 'ACK_MEDIA');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
    setShowAttachMenu(false);
  };

  // Node Discovery Search
  useEffect(() => {
    if (!globalSearch.trim() || !token) {
      setSearchedUsers([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(globalSearch.trim())}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return;
        const text = await res.text();
        const data = text ? JSON.parse(text) : {};
        setSearchedUsers(data.users || []);
      } catch (_) {}
    }, 200);
    return () => clearTimeout(t);
  }, [globalSearch, token]);

  const startChatWithUser = (user: User) => {
    const sorted = [Number(currentUser!.id), Number(user.id)].sort((a, b) => a - b);
    const convId = `conv_${sorted[0]}_${sorted[1]}`;

    let conv = conversations.find((c) => c.id === convId);
    if (!conv) {
      conv = {
        id: convId,
        peer_id: user.id,
        peer_name: user.name,
        peer_email: user.email,
        peer_phone: user.phone,
        updated_at: Date.now(),
        isOnline: false
      };
      setConversations((prev) => [conv!, ...prev]);
    }
    openConversation(conv);
    setGlobalSearch('');
    setShowNewChatModal(false);
  };

  if (!token || !currentUser) {
    return (
      <div className="screen-modal active auth-screen-wrapper">
        <Toaster />

        {/* Startup Top Header Bar */}
        <header className="auth-startup-bar">
          <div className="startup-brand">
            <Atom size={20} className="brand-pulse-cyan" />
            <span className="startup-brand-title">NEXUS // QUANTUM COMMS</span>
          </div>
          <button
            type="button"
            className="btn-startup-download"
            onClick={handleInstallApp}
            title="Download & Install NEXUS App"
          >
            <Download size={14} />
            <span>DOWNLOAD APP</span>
          </button>
        </header>

        <div className="card auth-card">
          <div className="brand">
            <div className="brand-icon-wrapper">
              <Atom className="brand-icon" size={32} />
              <div className="ring-orbit" />
            </div>
            <h2>NEXUS // OS</h2>
            <p className="brand-sub">QUANTUM END-TO-END ENCRYPTED COMMS</p>
          </div>

          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab-btn ${authMode === 'login' ? 'active' : ''}`}
              onClick={() => { setAuthMode('login'); setLoginErrors({}); }}
            >
              Terminal Access
            </button>
            <button
              type="button"
              className={`auth-tab-btn ${authMode === 'register' ? 'active' : ''}`}
              onClick={() => { setAuthMode('register'); setRegErrors({}); }}
            >
              Register Node
            </button>
          </div>

          {authMode === 'login' ? (
            <form onSubmit={handleLogin} className="auth-form" noValidate>
              <div className="form-group">
                <label>Comm ID (Email or Phone)</label>
                <input
                  type="text"
                  className={loginErrors.identifier ? 'input-error' : ''}
                  placeholder="operator@nexus.net or +123456789"
                  value={loginIdentifier}
                  onChange={(e) => {
                    setLoginIdentifier(e.target.value);
                    if (loginErrors.identifier) setLoginErrors((p) => ({ ...p, identifier: '' }));
                  }}
                />
                {loginErrors.identifier && (
                  <div className="field-error-wrapper">
                    <span className="field-error-icon">▲</span>
                    <span className="field-error">{loginErrors.identifier}</span>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>Neural Keyphrase / Password</label>
                <input
                  type="password"
                  className={loginErrors.password ? 'input-error' : ''}
                  placeholder="Enter keyphrase (min 6 chars)"
                  value={loginPassword}
                  onChange={(e) => {
                    setLoginPassword(e.target.value);
                    if (loginErrors.password) setLoginErrors((p) => ({ ...p, password: '' }));
                  }}
                />
                {loginErrors.password && (
                  <div className="field-error-wrapper">
                    <span className="field-error-icon">▲</span>
                    <span className="field-error">{loginErrors.password}</span>
                  </div>
                )}
              </div>
              <button type="submit" className="btn btn-primary btn-block">Authenticate Uplink</button>
              <div className="auth-switch">
                Unregistered node?{' '}
                <span
                  className="auth-link"
                  onClick={() => { setAuthMode('register'); setRegErrors({}); }}
                >
                  Register Node
                </span>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="auth-form" noValidate>
              <div className="form-group">
                <label>Operative Name</label>
                <input
                  type="text"
                  className={regErrors.name ? 'input-error' : ''}
                  placeholder="Commander Vane"
                  value={regName}
                  onChange={(e) => {
                    setRegName(e.target.value);
                    if (regErrors.name) setRegErrors((p) => ({ ...p, name: '' }));
                  }}
                />
                {regErrors.name && (
                  <div className="field-error-wrapper">
                    <span className="field-error-icon">▲</span>
                    <span className="field-error">{regErrors.name}</span>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>Comm Frequency (Email)</label>
                <input
                  type="email"
                  className={regErrors.email ? 'input-error' : ''}
                  placeholder="vane@nexus.net"
                  value={regEmail}
                  onChange={(e) => {
                    setRegEmail(e.target.value);
                    if (regErrors.email) setRegErrors((p) => ({ ...p, email: '' }));
                  }}
                />
                {regErrors.email && (
                  <div className="field-error-wrapper">
                    <span className="field-error-icon">▲</span>
                    <span className="field-error">{regErrors.email}</span>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>Comms Band (Phone - Optional)</label>
                <input
                  type="tel"
                  className={regErrors.phone ? 'input-error' : ''}
                  placeholder="+1234567890 (optional)"
                  value={regPhone}
                  onChange={(e) => {
                    setRegPhone(e.target.value);
                    if (regErrors.phone) setRegErrors((p) => ({ ...p, phone: '' }));
                  }}
                />
                {regErrors.phone && (
                  <div className="field-error-wrapper">
                    <span className="field-error-icon">▲</span>
                    <span className="field-error">{regErrors.phone}</span>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>Master Cipher Key</label>
                <input
                  type="password"
                  className={regErrors.password ? 'input-error' : ''}
                  placeholder="Create password (min 6 chars)"
                  value={regPassword}
                  onChange={(e) => {
                    setRegPassword(e.target.value);
                    if (regErrors.password) setRegErrors((p) => ({ ...p, password: '' }));
                  }}
                />
                {regErrors.password && (
                  <div className="field-error-wrapper">
                    <span className="field-error-icon">▲</span>
                    <span className="field-error">{regErrors.password}</span>
                  </div>
                )}
              </div>
              <button type="submit" className="btn btn-primary btn-block">Initialize Node</button>
              <div className="auth-switch">
                Existing operative?{' '}
                <span
                  className="auth-link"
                  onClick={() => { setAuthMode('login'); setLoginErrors({}); }}
                >
                  Access Terminal
                </span>
              </div>
            </form>
          )}

          {/* Native PWA App Download */}
          <div className="auth-download-section">
            <div className="auth-divider">
              <span>OR NATIVE APP</span>
            </div>
            <button
              type="button"
              className="btn-download-app"
              onClick={handleInstallApp}
              title="Download & Install NEXUS App"
            >
              <Download size={15} />
              <span>DOWNLOAD NEXUS APP</span>
            </button>
          </div>
        </div>
        {renderInstallGuideModal()}
      </div>
    );
  }

  return (
    <div className="whatsapp-layout cyber-layout">
      <Toaster />
      {/* Soft Audio / Video Call Ringtones & Message Notification Tone */}
      <audio ref={audioCallRingtoneRef} loop src="/sounds/call-audio.mp3" preload="auto" />
      <audio ref={videoCallRingtoneRef} loop src="/sounds/call-video.mp3" preload="auto" />
      <audio ref={messageToneRef} src="/sounds/message.mp3" preload="auto" />
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ position: 'fixed', opacity: 0, pointerEvents: 'none' }} />

      {/* Left Sidebar */}
      <aside className={`sidebar ${mobileChatOpen ? 'mobile-hidden' : ''}`}>
        <header className="sidebar-header">
          <div className="user-profile">
            <div className="avatar"><Atom size={20} /></div>
            <div className="user-meta">
              <span className="user-name">{currentUser.name}</span>
              <span className="user-status-text">NODE ONLINE</span>
            </div>
          </div>
          <div className="header-tools">
            <button
              className="tool-icon-btn text-[#00f0ff] cursor-pointer"
              onClick={handleInstallApp}
              title="Download NEXUS App / Install PWA"
            >
              <Download size={17} />
            </button>
            <button className="tool-icon-btn" onClick={() => setShowNewChatModal(true)} title="Locate Node">
              <Plus size={18} />
            </button>
            <button
              className="tool-icon-btn text-danger cursor-pointer"
              onClick={() => setShowLogoutModal(true)}
              title="Disconnect"
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        {/* Global Node Search */}
        <div className="search-bar-wrapper">
          <div className="search-box">
            <Search size={14} />
            <input
              type="text"
              placeholder="Scan nodes by frequency or identity..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
            />
          </div>
        </div>

        {searchedUsers.length > 0 && (
          <div className="search-results-panel">
            <div className="search-results-header">DISCOVERED NODES</div>
            {searchedUsers.map((u) => (
              <div key={u.id} className="user-search-item" onClick={() => startChatWithUser(u)}>
                <div className="user-search-info">
                  <div className="avatar"><UserIcon size={16} /></div>
                  <div>
                    <div className="user-search-name">{u.name}</div>
                    <div className="user-search-contact">{u.phone ? `${u.phone} • ` : ''}{u.email}</div>
                  </div>
                </div>
                <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: '11px' }}>UPLINK</button>
              </div>
            ))}
          </div>
        )}

        {/* Conversation List */}
        <div className="conversations-list w-full flex-1 overflow-y-auto overflow-x-hidden">
          {conversations.length === 0 ? (
            <div className="empty-channels-deck">
              <div className="empty-channels-icon">
                <Radio size={22} className="animate-pulse" />
              </div>
              <div className="empty-channels-title">NO ACTIVE FREQUENCIES</div>
              <div className="empty-channels-sub">
                Transmit uplink request or locate remote operative node
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '11px', padding: '6px 14px', marginTop: '6px', borderRadius: '8px' }}
                onClick={() => setShowNewChatModal(true)}
              >
                <Plus size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-2px' }} /> LOCATE OPERATIVE
              </button>
            </div>
          ) : (
            conversations.map((c) => (
              <div
                key={c.id}
                className={`conv-item ${activeConv?.id === c.id ? 'active' : ''}`}
                onClick={() => openConversation(c)}
              >
                <div className="avatar-wrapper">
                  <div className="avatar"><UserIcon size={18} /></div>
                  <span className={`status-indicator ${c.isOnline ? 'online' : ''}`} />
                </div>
                <div className="conv-info">
                  <div className="conv-top">
                    <span className="conv-name">{c.peer_name}</span>
                    <span className="conv-time">
                      {c.lastMessage ? new Date(c.lastMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                  <p className="conv-last-msg">
                    {c.lastMessage ? (c.lastMessage.is_unsent ? '🚫 Message unsent' : c.lastMessage.text) : 'Channel initialized'}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Right Pane: Tactical Comms */}
      <main className={`chat-main ${mobileChatOpen ? 'mobile-active' : ''}`}>
        {!activeConv ? (
          <div className="empty-chat-screen">
            <div className="empty-content">
              <div className="holo-icon-ring">
                <Radio className="empty-icon" />
              </div>
              <h2>NEURAL COMMS DECK</h2>
              <p>Quantum cryptographic channel ready. Select an active frequency or locate a node to transmit encrypted telemetry.</p>
              <button className="btn btn-primary" onClick={() => setShowNewChatModal(true)}>
                <Crosshair size={16} /> Locate Operative
              </button>
            </div>
          </div>
        ) : (
          <div className="active-chat-screen">
            {/* Top Chat Header */}
            <header className="chat-header">
              <div className="chat-peer-info">
                <button className="tool-icon-btn mobile-only" onClick={() => setMobileChatOpen(false)}>
                  <ArrowLeft size={16} />
                </button>
                <div className="avatar-wrapper">
                  <div className="avatar"><UserIcon size={18} /></div>
                  <span className={`status-indicator ${activeConv.isOnline ? 'online' : ''}`} />
                </div>
                <div className="peer-text">
                  <h3>{activeConv.peer_name}</h3>
                  <span className={`peer-status ${peerTyping ? 'typing' : activeConv.isOnline ? 'online' : ''}`}>
                    {peerTyping ? 'TRANSMITTING...' : activeConv.isOnline ? 'ONLINE' : activeConv.peer_phone}
                  </span>
                </div>
              </div>

              <div className="chat-header-actions">
                <button className="action-btn" onClick={() => setShowInChatSearch(!showInChatSearch)} title="Query Transmissions">
                  <Search size={16} />
                </button>
                <button className="action-btn call-btn" onClick={() => startCall('audio')} title="Audio Link">
                  <Headset size={16} />
                </button>
                <button className="action-btn call-btn" onClick={() => startCall('video')} title="Video Uplink">
                  <Video size={16} />
                </button>
                <button className="action-btn text-danger cursor-pointer" onClick={() => setShowDeleteModal(true)} title="Purge Frequency">
                  <Trash2 size={16} />
                </button>
              </div>
            </header>

            {/* In-Chat Search Bar */}
            {showInChatSearch && (
              <div className="in-chat-search-bar">
                <Search size={14} />
                <input
                  type="text"
                  placeholder="Scan loaded packets..."
                  value={inChatSearchQuery}
                  onChange={(e) => setInChatSearchQuery(e.target.value)}
                  autoFocus
                />
                <button className="btn-search-close" onClick={() => setShowInChatSearch(false)}>
                  <X size={16} />
                </button>
              </div>
            )}

            {/* Messages Viewport */}
            <div
              className="chat-messages-viewport"
              ref={messagesViewportRef}
              onClick={() => {
                setActiveReactionMenuId(null);
                setShowEmojiPicker(false);
              }}
            >
              <div className="messages-flow">
                {messages.map((m: any, idx) => {
                  const isSent = (m.sender_id || m.senderId) === currentUser.id;
                  const isUnsent = m.is_unsent === 1 || m.isUnsent === 1;

                  return (
                    <div key={m.id || idx} className={`msg-row ${isSent ? 'sent' : 'received'}`}>
                      <div className="msg-bubble-wrapper">
                        {/* Quick Action Deck (Reaction + Unsend) */}
                        {!isUnsent && (
                          <div className="msg-actions-deck">
                            <button
                              type="button"
                              className={`reaction-trigger-btn ${activeReactionMenuId === (m.id || idx) ? 'active' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveReactionMenuId(activeReactionMenuId === (m.id || idx) ? null : (m.id || idx));
                              }}
                              title="Add reaction"
                            >
                              <SmilePlus size={14} />
                            </button>

                            {isSent && (
                              <button
                                type="button"
                                className="msg-unsend-trigger-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUnsend(m.id || idx);
                                }}
                                title="Unsend transmission for everyone"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        )}

                        {/* Reaction Menu Bar with Emojis + Unsend Action */}
                        {activeReactionMenuId === (m.id || idx) && !isUnsent && (
                          <div className="reaction-menu-popover" onClick={(e) => e.stopPropagation()}>
                            <div className="reaction-emojis-row">
                              {['❤️', '👍', '😂', '😮', '😢', '🔥'].map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  className="reaction-emoji-btn"
                                  onClick={() => handleSendReaction(m.id || idx, emoji)}
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                            {isSent && (
                              <button
                                type="button"
                                className="reaction-unsend-item"
                                onClick={() => {
                                  handleUnsend(m.id || idx);
                                  setActiveReactionMenuId(null);
                                }}
                                title="Unsend transmission for everyone"
                              >
                                <Trash2 size={13} />
                                <span>Unsend</span>
                              </button>
                            )}
                          </div>
                        )}

                        <div className={`msg-bubble ${m.dataUrl && (m.type === 'image' || m.type === 'gif' || m.type === 'video') ? 'media-bubble' : ''}`}>
                          {isUnsent ? (
                            <span className="msg-text unsent">
                              <Ban size={14} /> This transmission was unsent
                            </span>
                          ) : m.dataUrl ? (
                            m.type === 'gif' ? (
                              <img
                                src={m.dataUrl}
                                className="chat-gif"
                                onClick={() => setLightboxImg(m.dataUrl)}
                                alt="Holographic GIF"
                                loading="eager"
                              />
                            ) : m.type === 'image' ? (
                              <img
                                src={m.dataUrl}
                                className="chat-image"
                                onClick={() => setLightboxImg(m.dataUrl)}
                                alt="Holofeed"
                              />
                            ) : m.type === 'video' ? (
                              <video src={m.dataUrl} className="chat-video" controls autoPlay loop muted playsInline />
                            ) : m.type === 'audio' ? (
                              <audio src={m.dataUrl} className="chat-audio" controls />
                            ) : (
                              <a href={m.dataUrl} download={m.fileName} className="chat-file-card">
                                <FileText size={20} />
                                <div>
                                  <div>{m.fileName}</div>
                                  <small style={{ color: '#7e8da0' }}>Click to download</small>
                                </div>
                              </a>
                            )
                          ) : (
                            <span className="msg-text">
                              {m.text?.toLowerCase().includes('missed') ? (
                                <span className="flex items-center gap-1.5 text-red-400 font-semibold">
                                  <PhoneOff size={15} className="inline flex-shrink-0 text-red-400" />
                                  <span>{m.text}</span>
                                </span>
                              ) : (
                                m.text
                              )}
                            </span>
                          )}

                          <div className="msg-meta">
                            {new Date(m.created_at || m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {isSent && (
                              <span
                                className={m.is_read === 1 ? 'text-[#00f0ff] filter drop-shadow-[0_0_6px_rgba(0,240,255,0.7)]' : 'text-[#64748b]'}
                                title={m.is_read === 1 ? 'Seen by operative' : 'Transmitted'}
                              >
                                <CheckCheck size={14} />
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Reaction Badges beneath Bubble */}
                        {reactions[m.id || idx] && reactions[m.id || idx].length > 0 && (
                          <div className="reactions-display">
                            {reactions[m.id || idx].map((em, i) => (
                              <span key={i} className="reaction-pill" onClick={() => handleSendReaction(m.id || idx, em)}>
                                {em}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Input Bar */}
            <footer className="chat-input-bar relative">
              <input type="file" id="media-uploader" className="hidden" onChange={handleFileUpload} />

              {/* Emoji Picker Popover */}
              {showEmojiPicker && (
                <div className="emoji-popover" onClick={(e) => e.stopPropagation()}>
                  <div className="emoji-grid">
                    {['😀', '😂', '😍', '😎', '🔥', '👍', '🎉', '🚀', '💀', '💯', '✨', '⚡', '🤖', '👾', '🔒', '💡', '❤️', '👏', '🙌', '👀', '🤙', '🎯', '💫', '💥'].map((em) => (
                      <button
                        key={em}
                        type="button"
                        className="emoji-grid-item"
                        onClick={() => {
                          setMessageText((prev) => prev + em);
                        }}
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="input-actions-left" style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="tool-btn"
                  onClick={() => document.getElementById('media-uploader')?.click()}
                  title="Attach File"
                >
                  <Paperclip size={18} />
                </button>
                <button
                  type="button"
                  className={`tool-btn ${showEmojiPicker ? 'active' : ''}`}
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  title="Insert Emoji"
                >
                  <Smile size={18} />
                </button>
                <button
                  type="button"
                  className="tool-btn"
                  style={{ fontFamily: 'var(--font-hud)', fontWeight: 700, fontSize: '11px', letterSpacing: '0.5px' }}
                  onClick={() => {
                    setShowGifModal(true);
                    loadGifs('cyberpunk');
                  }}
                  title="Send Holographic GIF"
                >
                  GIF
                </button>
                <button
                  type="button"
                  className={`tool-btn ${isRecordingVoice ? 'recording' : ''}`}
                  onClick={toggleVoiceRecord}
                  title={isRecordingVoice ? 'Stop & Transmit Audio' : 'Record Voice Telemetry'}
                >
                  <Mic size={18} />
                </button>
              </div>

              <div className="text-input-wrapper" onClick={() => textareaRef.current?.focus()}>
                <textarea
                  ref={textareaRef}
                  placeholder="Transmit encrypted packet..."
                  rows={1}
                  value={messageText}
                  onFocus={() => {
                    scrollToBottom();
                    setTimeout(() => {
                      textareaRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    }, 200);
                  }}
                  onChange={(e) => {
                    setMessageText(e.target.value);
                    if (activeConv) {
                      socketRef.current?.emit('typing', {
                        recipientId: activeConv.peer_id,
                        conversationId: activeConv.id,
                        isTyping: true
                      });
                      clearTimeout(typingTimeoutRef.current);
                      typingTimeoutRef.current = setTimeout(() => {
                        socketRef.current?.emit('typing', {
                          recipientId: activeConv.peer_id,
                          conversationId: activeConv.id,
                          isTyping: false
                        });
                      }, 1500);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />
              </div>

              <button type="button" className="btn-send" onClick={handleSendMessage} title="Send Transmission">
                <Send size={18} />
              </button>
            </footer>
          </div>
        )}
      </main>

      {/* New Chat / Node Discovery Modal */}
      {showNewChatModal && (
        <div className="modal-backdrop" onClick={() => setShowNewChatModal(false)}>
          <div className="new-chat-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <Crosshair size={18} style={{ color: 'var(--neon-cyan)' }} /> Connect Remote Node
              </h3>
              <button
                type="button"
                className="icon-close"
                onClick={() => setShowNewChatModal(false)}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="input-with-button">
              <input
                type="text"
                placeholder="e.g. +123456789 or agent@nexus.net"
                value={newChatSearchInput}
                onChange={(e) => setNewChatSearchInput(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const q = newChatSearchInput.trim();
                    if (!q) return;
                    try {
                      const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, {
                        headers: { Authorization: `Bearer ${token}` }
                      });
                      if (!res.ok) {
                        setNewChatResults([]);
                        cyberToast.info('No remote operatives located', 'DISC_NONE');
                        return;
                      }
                      const text = await res.text();
                      const data = text ? JSON.parse(text) : {};
                      const results = data.users || [];
                      setNewChatResults(results);
                      if (results.length === 0) {
                        cyberToast.info('No remote operatives located', 'DISC_NONE');
                      }
                    } catch {
                      cyberToast.error('Node scan failed', 'ERR_SCAN');
                    }
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: '0 18px', fontSize: '13px' }}
                onClick={async () => {
                  const q = newChatSearchInput.trim();
                  if (!q) return;
                  try {
                    const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, {
                      headers: { Authorization: `Bearer ${token}` }
                    });
                    if (!res.ok) {
                      setNewChatResults([]);
                      cyberToast.info('No remote operatives located', 'DISC_NONE');
                      return;
                    }
                    const text = await res.text();
                    const data = text ? JSON.parse(text) : {};
                    const results = data.users || [];
                    setNewChatResults(results);
                    if (results.length === 0) {
                      cyberToast.info('No remote operatives located', 'DISC_NONE');
                    }
                  } catch {
                    cyberToast.error('Node scan failed', 'ERR_SCAN');
                  }
                }}
              >
                Locate
              </button>
            </div>

            {/* Discovered Users List */}
            <div className="new-chat-results">
              {newChatResults.length === 0 ? (
                <p className="empty-sub" style={{ textAlign: 'center', padding: '24px 0', fontSize: '12px', color: '#64748b' }}>
                  Enter operative email or phone frequency to scan
                </p>
              ) : (
                newChatResults.map((u) => (
                  <div
                    key={u.id}
                    onClick={() => startChatWithUser(u)}
                    className="conv-item"
                    style={{ padding: '10px 14px', borderRadius: '10px', cursor: 'pointer' }}
                  >
                    <div className="avatar-wrapper">
                      <div className="avatar"><UserIcon size={16} /></div>
                    </div>
                    <div className="conv-info" style={{ flex: 1, minWidth: 0 }}>
                      <div className="conv-name">{u.name}</div>
                      <div className="conv-time" style={{ color: '#64748b', fontSize: '11px' }}>
                        {u.phone ? `${u.phone} • ` : ''}{u.email}
                      </div>
                    </div>
                    <button className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: '11px', borderRadius: '6px' }}>
                      UPLINK
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Call Overlay */}
      {activeCall && (
        <div className="call-overlay">
          <div className="call-container">
            <div className="call-top-bar">
              <span className={`call-timer ${activeCall.status === 'connected' ? '' : 'animate-pulse'}`}>
                {activeCall.status === 'connected' ? 'STREAM ACTIVE' : 'CALLING...'}
              </span>
              <span className="call-type-badge">
                {activeCall.callType === 'video' ? <Video size={16} /> : <Headset size={16} />} NEURAL STREAM
              </span>
            </div>

            <div className="video-grid">
              <div className="video-box remote-box">
                {activeCall.callType === 'video' ? (
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                  />
                ) : (
                  <div className="audio-avatar">
                    <Headset size={48} />
                    <div className="pulse-ring" />
                  </div>
                )}
                <span className="video-label">{activeCall.name}</span>
              </div>

              {activeCall.callType === 'video' && (
                <div className="video-box local-box">
                  <video ref={localVideoRef} autoPlay playsInline muted />
                  <span className="video-label">YOU</span>
                </div>
              )}
            </div>

            <div className="call-controls">
              <button
                className={`ctrl-btn ${isMuted ? 'off' : ''}`}
                onClick={() => {
                  const muted = !isMuted;
                  webrtcRef.current?.toggleAudio(!muted);
                  setIsMuted(muted);
                }}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                <Mic size={20} />
              </button>

              <button
                className={`ctrl-btn ${isLoud ? 'active text-[#00f0ff]' : ''}`}
                onClick={() => {
                  const nextLoud = !isLoud;
                  setIsLoud(nextLoud);
                  isLoudRef.current = nextLoud;
                  if (remoteAudioRef.current) {
                    remoteAudioRef.current.volume = nextLoud ? 1.0 : 0.4;
                  }
                  if (remoteVideoRef.current) {
                    remoteVideoRef.current.volume = nextLoud ? 1.0 : 0.4;
                  }
                  cyberToast.info(nextLoud ? 'Speaker (Loud) ON' : 'Speaker (Normal) ON', 'AUDIO_OUT');
                }}
                title={isLoud ? 'Speaker (Loud)' : 'Earpiece (Normal)'}
              >
                {isLoud ? <Volume2 size={20} /> : <Volume1 size={20} />}
              </button>

              {activeCall.callType === 'video' && (
                <button
                  className={`ctrl-btn ${isVideoOff ? 'off' : ''}`}
                  onClick={() => {
                    const off = !isVideoOff;
                    webrtcRef.current?.toggleVideo(!off);
                    setIsVideoOff(off);
                  }}
                  title={isVideoOff ? 'Enable Camera' : 'Disable Camera'}
                >
                  <Video size={20} />
                </button>
              )}

              <button className="ctrl-btn btn-hangup" onClick={() => endCall(true)} title="End Call">
                <PhoneOff size={20} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Incoming Call Alert (WhatsApp / Futuristic Cyber Style) */}
      {incomingCall && (
        <div className="incoming-call-backdrop" onClick={(e) => e.stopPropagation()}>
          <div className="incoming-call-card">
            <div className="incoming-call-badge">
              <span className="w-2 h-2 rounded-full bg-[#00f0ff] animate-ping" />
              INCOMING {incomingCall.callType.toUpperCase()} FREQUENCY
            </div>

            <div className="incoming-avatar-outer">
              <div className="incoming-avatar-ring" />
              <div className="incoming-avatar-pulse" />
              <div className="incoming-avatar-core">
                {incomingCall.callType === 'video' ? <Video size={36} /> : <Headset size={36} />}
              </div>
            </div>

            <h3 className="incoming-caller-title">{incomingCall.callerName}</h3>
            <p className="incoming-call-sub">Secure Quantum Uplink Requested...</p>

            <div className="incoming-actions-grid">
              <div className="call-btn-action-wrapper">
                <button
                  type="button"
                  className="btn-call-circle btn-call-decline"
                  onClick={declineIncomingCall}
                  title="Decline Call"
                >
                  <PhoneOff size={28} />
                </button>
                <span className="btn-call-label label-decline">DECLINE</span>
              </div>

              <div className="call-btn-action-wrapper">
                <button
                  type="button"
                  className="btn-call-circle btn-call-accept"
                  onClick={acceptIncomingCall}
                  title="Accept Call"
                >
                  {incomingCall.callType === 'video' ? <Video size={28} /> : <Phone size={28} />}
                </button>
                <span className="btn-call-label label-accept">ACCEPT</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sever Uplink (Logout) Confirmation Modal */}
      {showLogoutModal && (
        <div className="modal-backdrop" onClick={() => setShowLogoutModal(false)}>
          <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: 'rgba(255, 51, 102, 0.15)',
                border: '1px solid rgba(255, 51, 102, 0.4)',
                color: '#ff3366',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px'
              }}>
                <LogOut size={24} />
              </div>
              <h3 style={{ fontFamily: 'var(--font-hud)', fontSize: '20px', color: '#fff', letterSpacing: '1px' }}>
                Sever Uplink?
              </h3>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>
                Your neural session will be terminated on this terminal.
              </p>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowLogoutModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  localStorage.removeItem('cipherchat_jwt');
                  window.location.reload();
                }}
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Purge Frequency (Delete Chat) Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal-backdrop" onClick={() => setShowDeleteModal(false)}>
          <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: 'rgba(255, 51, 102, 0.15)',
                border: '1px solid rgba(255, 51, 102, 0.4)',
                color: '#ff3366',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px'
              }}>
                <Trash2 size={24} />
              </div>
              <h3 style={{ fontFamily: 'var(--font-hud)', fontSize: '20px', color: '#fff', letterSpacing: '1px' }}>
                Purge Channel Logs?
              </h3>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>
                All transmissions with {activeConv?.peer_name} will be permanently destroyed.
              </p>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={confirmDeleteChat}
              >
                Purge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GIF Picker Modal */}
      {showGifModal && (
        <div className="modal-backdrop" onClick={() => setShowGifModal(false)}>
          <div className="gif-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <Sparkles size={18} style={{ color: 'var(--neon-cyan)' }} /> Holo-GIF Dispatch
              </h3>
              <button
                type="button"
                className="icon-close"
                onClick={() => setShowGifModal(false)}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="input-with-button">
              <input
                type="text"
                placeholder="Search GIFs (e.g. matrix, laugh, cyberpunk)..."
                value={gifSearchInput}
                onChange={(e) => setGifSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    loadGifs(gifSearchInput.trim() || 'trending');
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: '0 16px', fontSize: '13px' }}
                onClick={() => loadGifs(gifSearchInput.trim() || 'trending')}
              >
                Scan
              </button>
            </div>

            <div className="gif-grid">
              {isLoadingGifs ? (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '30px 0', color: 'var(--neon-cyan)', fontFamily: 'var(--font-hud)' }}>
                  Scanning GIF relays...
                </div>
              ) : gifs.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '30px 0', color: '#64748b', fontSize: '12px' }}>
                  No GIF packets found
                </div>
              ) : (
                gifs.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt="GIF"
                    className="gif-thumb"
                    onClick={() => sendGif(url)}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxImg && (
        <div className="modal-backdrop" onClick={() => setLightboxImg(null)}>
          <div className="lightbox-content">
            <button className="lightbox-close" onClick={() => setLightboxImg(null)}><X size={24} /></button>
            <img src={lightboxImg} alt="Enlarged" />
          </div>
        </div>
      )}

      {/* PWA Install Guide Modal */}
      {renderInstallGuideModal()}
    </div>
  );
}

export default App;

