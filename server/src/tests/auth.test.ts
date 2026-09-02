import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index';
import prisma from '../db';

import { getTokens } from '../services/google';

describe('Auth API Routes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('GET /api/auth/google/callback', () => {
    it('should upsert google account and redirect to frontend', async () => {
      (getTokens as any).mockResolvedValue({
        access_token: 'acc_token', 
        refresh_token: 'ref_token'
      });
      
      const { getStorageQuota } = await import('../services/google');
      (getStorageQuota as any).mockResolvedValue({
        user: { emailAddress: 'mock@google.com' }
      });
      
      (prisma.user.findFirst as any).mockResolvedValue({
        id: 'user-1', email: 'admin@drive-merge.local'
      });
      
      (prisma.googleAccount.upsert as any).mockResolvedValue({
        id: '123',
        email: 'mock@google.com'
      });

      const response = await request(app).get('/api/auth/google/callback?code=mock_code');
      
      expect(response.status).toBe(200);
      expect(response.text).toContain('window.opener.postMessage("google-auth-success", "*")');
      expect(prisma.googleAccount.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { googleId: 'mock@google.com' }
      }));
    });
  });
});
