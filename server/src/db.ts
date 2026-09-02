import { PrismaClient } from '@prisma/client';
import { createClient } from '@libsql/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import dotenv from 'dotenv';

dotenv.config();

let prisma: PrismaClient;

// If Turso URL is provided, use the LibSQL adapter
if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
  const libsql = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  const adapter = new PrismaLibSQL(libsql);
  prisma = new PrismaClient({ adapter });
} else {
  // Fallback to standard client for local dev.db if not using Turso
  prisma = new PrismaClient();
}

export default prisma;
