import jwt from 'jsonwebtoken';
import type { Role } from '@idp/shared';
import { config } from '../config';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '12h' });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwtSecret) as JwtPayload;
}
