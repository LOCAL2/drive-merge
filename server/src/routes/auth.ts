import { Router } from 'express';
import { getAuthUrl, getTokens, getDriveClient, getStorageQuota } from '../services/google';
import prisma from '../db';

const router = Router();

// In a real app, this would be from a session/JWT. Hardcoding user 1 for simplicity.
const DEFAULT_USER_ID = "user-1"; 

router.get('/google', async (req, res) => {
  const url = getAuthUrl();
  res.redirect(url);
});

router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code || typeof code !== 'string') {
    return res.status(400).send('Invalid request');
  }

  try {
    const tokens = await getTokens(code);
    
    // We need an access token to get user info
    if (!tokens.access_token) throw new Error('No access token');
    
    // Initialize Google Drive client to get user email
    const drive = getDriveClient(tokens.access_token, tokens.refresh_token || '');
    const quota = await getStorageQuota(drive);
    
    if (!quota || !quota.user || !quota.user.emailAddress) {
       return res.status(500).send('Failed to get user email');
    }
    
    const email = quota.user.emailAddress;

    // Ensure our default user exists (temporary hack for single-user mode)
    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: { id: DEFAULT_USER_ID, email: 'admin@drive-merge.local' }
      });
    }

    // Save or update Google Account
    await prisma.googleAccount.upsert({
      where: { googleId: email },
      update: {
        accessToken: tokens.access_token,
        ...(tokens.refresh_token && { refreshToken: tokens.refresh_token }),
        tokenExpiry: new Date(tokens.expiry_date || Date.now() + 3600000),
      },
      create: {
        userId: user.id,
        googleId: email, // use email as ID for now
        email: email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || '',
        scope: tokens.scope || '',
        tokenExpiry: new Date(tokens.expiry_date || Date.now() + 3600000),
      }
    });

    res.send('<script>window.opener.postMessage("google-auth-success", "*"); window.close();</script>');
  } catch (error) {
    console.error('Error in OAuth callback', error);
    res.status(500).send('Authentication failed');
  }
});

router.get('/accounts', async (req, res) => {
  try {
    const accounts = await prisma.googleAccount.findMany({
      select: {
        id: true,
        email: true,
        updatedAt: true,
      }
    });
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

export default router;
