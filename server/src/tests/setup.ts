import { vi } from 'vitest';

vi.mock('../db', () => ({
  default: {
    googleAccount: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
    }
  },
}));

vi.mock('../services/google', () => ({
  getDriveClient: vi.fn(),
  getStorageQuota: vi.fn(),
  getTokens: vi.fn(),
  getAuthUrl: vi.fn(),
}));
