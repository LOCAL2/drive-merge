import { Router } from 'express';
import { getAuthUrl, getTokens, getDriveClient, getStorageQuota } from '../services/google';
import prisma from '../db';
import session from 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId: string;
  }
}

const router = Router();

// Endpoint to check current user session
router.get('/me', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

router.get('/google', async (req, res) => {
  const url = getAuthUrl();
  // Pass the current mode (login vs link) using state parameter
  const state = req.query.mode === 'login' ? 'login' : 'link';
  res.redirect(`${url}&state=${state}`);
});

router.get('/google/callback', async (req, res) => {
  const { code, state } = req.query;
  
  if (!code || typeof code !== 'string') {
    return res.status(400).send('Invalid request');
  }

  const isLogin = state === 'login';

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

    let user;

    if (isLogin) {
      // Find or create user for this Google account
      user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        user = await prisma.user.create({
          data: { email }
        });
      }
      req.session.userId = user.id;
    } else {
      // Linking account to existing session
      if (!req.session.userId) {
        return res.status(401).send('You must be logged in to link an account');
      }
      user = await prisma.user.findUnique({ where: { id: req.session.userId } });
      if (!user) {
         return res.status(401).send('User not found');
      }
    }

    // Save or update Google Account linked to the user
    await prisma.googleAccount.upsert({
      where: { googleId: email },
      update: {
        userId: user.id,
        accessToken: tokens.access_token,
        ...(tokens.refresh_token && { refreshToken: tokens.refresh_token }),
        tokenExpiry: new Date(tokens.expiry_date || Date.now() + 3600000),
      },
      create: {
        userId: user.id,
        googleId: email, 
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
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const accounts = await prisma.googleAccount.findMany({
      where: { userId: req.session.userId },
      select: {
        id: true,
        email: true,
        status: true,
        updatedAt: true,
      }
    });
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

router.delete('/revoke/:id', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const account = await prisma.googleAccount.findFirst({ 
      where: { id: req.params.id, userId: req.session.userId } 
    });
    if (!account) return res.status(404).json({ error: 'Account not found' });
    
    // Try to revoke the token with Google
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${account.accessToken}`, { method: 'POST' });
    } catch (e) {
      console.warn('Failed to revoke token on Google side, deleting locally anyway', e);
    }

    await prisma.googleAccount.delete({ where: { id: account.id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Revoke error', error);
    res.status(500).json({ error: 'Failed to revoke account' });
  }
});

export default router;
