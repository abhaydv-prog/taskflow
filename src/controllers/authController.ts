import { Request, Response } from 'express';
import * as authService from '../services/authService';
import { registerSchema, loginSchema, refreshSchema, logoutSchema } from '../validators/authValidators';
import { AppError } from '../middleware/errorHandler';

export async function registerHandler(req: Request, res: Response) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid registration data', { issues: parsed.error.issues });
  }
  const { email, password, name, organizationName } = parsed.data;
  const tokens = await authService.register(email, password, name, organizationName);
  res.status(201).json(tokens);
}

export async function loginHandler(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid login data', { issues: parsed.error.issues });
  }
  const { email, password } = parsed.data;
  const tokens = await authService.login(email, password);
  res.status(200).json(tokens);
}

export async function refreshHandler(req: Request, res: Response) {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid refresh data', { issues: parsed.error.issues });
  }
  const tokens = await authService.refresh(parsed.data.refreshToken);
  res.status(200).json(tokens);
}

export async function logoutHandler(req: Request, res: Response) {
  const parsed = logoutSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid logout data', { issues: parsed.error.issues });
  }
  await authService.logout(parsed.data.refreshToken);
  res.status(200).json({ message: 'Logged out successfully' });
}