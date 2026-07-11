/**
 * Shared test helpers: build the Express app under the synthetic-DB mock, and
 * log in through the real /auth/login endpoint to obtain JWTs for each seeded
 * account. Logging in (rather than hand-signing tokens) means auth itself is
 * exercised on every protected-route test.
 */
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../app';
import { CREDENTIALS } from './synthetic-db';

export const app: Express = createApp();

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token as string;
}

export interface Tokens {
  admin: string;
  dev: string;
  otherDev: string;
  teamless: string;
}

/** Log in all four seeded accounts; call after seedDatabase() in beforeEach. */
export async function loginAll(): Promise<Tokens> {
  const [admin, dev, otherDev, teamless] = await Promise.all([
    login(CREDENTIALS.admin.email, CREDENTIALS.admin.password),
    login(CREDENTIALS.dev.email, CREDENTIALS.dev.password),
    login(CREDENTIALS.otherDev.email, CREDENTIALS.otherDev.password),
    login(CREDENTIALS.teamless.email, CREDENTIALS.teamless.password),
  ]);
  return { admin, dev, otherDev, teamless };
}
