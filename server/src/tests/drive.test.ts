import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index';
import prisma from '../db';
import { getDriveClient, getStorageQuota } from '../services/google';

describe('Drive API Routes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('GET /api/drive/quota', () => {
    it('should calculate merged quota correctly', async () => {
      const mockAccounts = [
        { id: '1', email: 'test1@test.com', accessToken: 'a1', refreshToken: 'r1' },
        { id: '2', email: 'test2@test.com', accessToken: 'a2', refreshToken: 'r2' },
      ];

      (prisma.googleAccount.findMany as any).mockResolvedValue(mockAccounts);

      // Mock google service
      (getDriveClient as any).mockReturnValue({});
      (getStorageQuota as any).mockResolvedValueOnce({
        limit: '1000',
        usage: '200',
        user: { photoLink: 'http://photo1.com' }
      }).mockResolvedValueOnce({
        limit: '2000',
        usage: '500',
        user: { photoLink: 'http://photo2.com' }
      });

      const response = await request(app).get('/api/drive/quota');
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        totalLimit: 3000,
        totalUsage: 700,
        accounts: [
          { id: '1', email: 'test1@test.com', limit: '1000', usage: '200', photoLink: 'http://photo1.com' },
          { id: '2', email: 'test2@test.com', limit: '2000', usage: '500', photoLink: 'http://photo2.com' }
        ]
      });
    });
  });

  describe('GET /api/drive/files', () => {
    it('should list and merge files from multiple accounts', async () => {
      const mockAccounts = [
        { id: '1', email: 'test1@test.com', accessToken: 'a1', refreshToken: 'r1' },
        { id: '2', email: 'test2@test.com', accessToken: 'a2', refreshToken: 'r2' },
      ];

      (prisma.googleAccount.findMany as any).mockResolvedValue(mockAccounts);

      const mockList = vi.fn();
      mockList.mockResolvedValueOnce({
        data: { files: [{ id: 'f1', name: 'File 1', createdTime: '2023-01-01T00:00:00Z' }] }
      }).mockResolvedValueOnce({
        data: { files: [{ id: 'f2', name: 'File 2', createdTime: '2023-01-02T00:00:00Z' }] }
      });

      (getDriveClient as any).mockReturnValue({
        files: { list: mockList }
      });

      const response = await request(app).get('/api/drive/files');
      
      expect(response.status).toBe(200);
      expect(response.body.files).toHaveLength(2);
      // Ensure sorted by createdTime descending (File 2 then File 1)
      expect(response.body.files[0].name).toBe('File 2');
      expect(response.body.files[1].name).toBe('File 1');
      
      // Ensure account context is appended
      expect(response.body.files[0].accountEmail).toBe('test2@test.com');
      expect(response.body.files[1].accountEmail).toBe('test1@test.com');
    });
  });
});
