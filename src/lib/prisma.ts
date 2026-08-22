import { PrismaClient } from '@prisma/client';

// Singleton pattern — prevents creating a new PrismaClient (and new
// connection pool) on every hot-reload in dev, which exhausts Postgres
// connections quickly.
export const prisma = new PrismaClient();