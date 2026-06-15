import type { RequestHandler } from 'express';
import type { ZodSchema } from 'zod';
import { HttpError } from './error';

/** Validate and coerce `req.body` against a Zod schema. */
export function validateBody<T>(schema: ZodSchema<T>): RequestHandler {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      next(new HttpError(400, 'validation_error', parsed.error.flatten()));
      return;
    }
    req.body = parsed.data;
    next();
  };
}
