import { PrismaClient } from './generated/prisma';

// Reuse a single PrismaClient across hot reloads (tsx watch) to avoid
// exhausting Postgres connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.PRISMA_LOG === 'query' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Re-export Prisma's generated types/enums so the rest of the codebase imports
// everything Prisma-related from `@idp/shared`.
export * from './generated/prisma';
