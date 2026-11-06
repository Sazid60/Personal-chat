import { z } from 'zod';

export const RegisterSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional().or(z.literal('')),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

export const LoginSchema = z.object({
  identifier: z.string().min(1, 'Email or phone required'),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

export const SendMessageSchema = z.object({
  recipientId: z.coerce.number().int().positive(),
  text: z.string().min(1, 'Message cannot be empty'),
  messageId: z.string().optional()
});

export const UnsendMessageSchema = z.object({
  messageId: z.coerce.string(),
  conversationId: z.string(),
  recipientId: z.coerce.number().int().positive()
});

export const PushSubscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string(),
      auth: z.string()
    })
  })
});
