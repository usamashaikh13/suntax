import { z } from 'zod';

// ─── Auth Schemas ─────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Enter a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required'),
});

export type LoginFormData = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    full_name: z
      .string()
      .min(2, 'Name must contain at least 2 characters')
      .max(100, 'Name is too long'),
    email: z
      .string()
      .min(1, 'Email is required')
      .email('Enter a valid email address'),
    password: z
      .string()
      .min(8, 'Password must contain at least 8 characters')
      .regex(/[A-Z]/, 'Include at least one uppercase letter')
      .regex(/[a-z]/, 'Include at least one lowercase letter')
      .regex(/[0-9]/, 'Include at least one number')
      .regex(/[^A-Za-z0-9]/, 'Include at least one special character'),
    confirm_password: z.string().min(1, 'Please confirm your password'),
    accept_terms: z
      .boolean()
      .refine((val) => val === true, 'You must accept the terms and conditions'),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

export type RegisterFormData = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Enter a valid email address'),
});

export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Password must contain at least 8 characters')
      .regex(/[A-Z]/, 'Include at least one uppercase letter')
      .regex(/[a-z]/, 'Include at least one lowercase letter')
      .regex(/[0-9]/, 'Include at least one number')
      .regex(/[^A-Za-z0-9]/, 'Include at least one special character'),
    confirm_password: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

// ─── Tax Return Schemas ───────────────────────────────────────────────────────

export const taxReturnCreateSchema = z.object({
  canton_code: z
    .string()
    .min(2, 'Canton is required')
    .max(2, 'Invalid canton code'),
  municipality_id: z
    .number({ required_error: 'Municipality is required' })
    .int()
    .positive('Invalid municipality'),
  tax_year: z
    .number({ required_error: 'Tax year is required' })
    .int()
    .min(2020, 'Invalid tax year')
    .max(2030, 'Invalid tax year'),
});

export type TaxReturnCreateFormData = z.infer<typeof taxReturnCreateSchema>;

// ─── Profile Schemas ──────────────────────────────────────────────────────────

export const profileUpdateSchema = z.object({
  full_name: z
    .string()
    .min(2, 'Name must contain at least 2 characters')
    .max(100, 'Name is too long')
    .optional(),
  email: z.string().email('Enter a valid email address').optional(),
});

export type ProfileUpdateFormData = z.infer<typeof profileUpdateSchema>;

export const passwordChangeSchema = z
  .object({
    current_password: z.string().min(1, 'Current password is required'),
    new_password: z
      .string()
      .min(8, 'New password must contain at least 8 characters')
      .regex(/[A-Z]/, 'Include at least one uppercase letter')
      .regex(/[a-z]/, 'Include at least one lowercase letter')
      .regex(/[0-9]/, 'Include at least one number')
      .regex(/[^A-Za-z0-9]/, 'Include at least one special character'),
    confirm_new_password: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.new_password === data.confirm_new_password, {
    message: 'Passwords do not match',
    path: ['confirm_new_password'],
  })
  .refine((data) => data.current_password !== data.new_password, {
    message: 'New password must be different from your current password',
    path: ['new_password'],
  });

export type PasswordChangeFormData = z.infer<typeof passwordChangeSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calculates password strength score (0-4) for strength indicator.
 */
export function getPasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
} {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const levels = [
    { score: 0, label: '', color: '' },
    { score: 1, label: 'Sehr schwach', color: 'bg-red-500' },
    { score: 2, label: 'Schwach', color: 'bg-orange-500' },
    { score: 3, label: 'Mittel', color: 'bg-yellow-500' },
    { score: 4, label: 'Stark', color: 'bg-green-500' },
    { score: 5, label: 'Sehr stark', color: 'bg-emerald-500' },
  ];

  return levels[Math.min(score, 5)] ?? { score: 0, label: '', color: '' };
}
