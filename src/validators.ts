import { z } from 'zod';

export const ClientLoginSchema = z.object({
  identifier: z.string().min(1, 'Comm frequency (email/phone) is required'),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

export const ClientRegisterSchema = z.object({
  name: z.string().min(2, 'Operative name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().optional().or(z.literal('')),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

export const ClientMessageSchema = z.object({
  text: z.string().min(1, 'Transmission cannot be empty')
});

export type ClientLoginInput = z.infer<typeof ClientLoginSchema>;
export type ClientRegisterInput = z.infer<typeof ClientRegisterSchema>;
