export interface User {
  id: number;
  name: string;
  email: string;
  phone: string;
  avatar?: string;
}

export interface Conversation {
  id: string;
  peer_id: number;
  peer_name: string;
  peer_email: string;
  peer_phone: string;
  peer_avatar?: string;
  updated_at: number;
  isOnline: boolean;
  lastMessage?: {
    id: string;
    text: string;
    is_unsent: number;
    sender_id: number;
    created_at: number;
  } | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: number;
  recipient_id: number;
  text: string;
  is_unsent: number;
  is_read?: number;
  created_at: number;
}

export interface MediaMessage {
  id?: string;
  type: 'image' | 'video' | 'audio' | 'file' | 'gif';
  dataUrl: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  conversationId: string;
  conversation_id?: string;
  senderId: number;
  sender_id?: number;
  recipientId: number;
  recipient_id?: number;
  is_unsent?: number;
  is_read?: number;
  createdAt: number;
  created_at?: number;
}

