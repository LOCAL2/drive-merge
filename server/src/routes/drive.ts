import { Router } from 'express';
import prisma from '../db';
import { getDriveClient, getStorageQuota } from '../services/google';
import multer from 'multer';
import fs from 'fs';

const router = Router();
const upload = multer({ dest: 'uploads/' }); // Temporary storage for uploads

// 1. Get Merged Quota
router.get('/quota', async (req, res) => {
  try {
    const accounts = await prisma.googleAccount.findMany();
    
    const quotaPromises = accounts.map(async (account) => {
      const drive = getDriveClient(account.accessToken, account.refreshToken);
      const quota = await getStorageQuota(drive);
      if (quota && quota.limit) {
        return {
          email: account.email,
          limit: quota.limit,
          usage: quota.usage
        };
      }
      return null;
    });

    const results = await Promise.all(quotaPromises);
    
    let totalLimit = 0;
    let totalUsage = 0;
    const accountDetails = [];

    for (const result of results) {
      if (result) {
        totalLimit += parseInt(result.limit);
        totalUsage += parseInt(result.usage || '0');
        accountDetails.push(result);
      }
    }

    res.json({
      totalLimit,
      totalUsage,
      accounts: accountDetails
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch quota' });
  }
});

// 2. List all files merged
router.get('/files', async (req, res) => {
  try {
    const accounts = await prisma.googleAccount.findMany();
    
    const filesPromises = accounts.map(async (account) => {
      const drive = getDriveClient(account.accessToken, account.refreshToken);
      try {
        const response = await drive.files.list({
          pageSize: 100,
          fields: 'nextPageToken, files(id, name, mimeType, size, webViewLink, webContentLink, createdTime)',
          q: "trashed = false",
        });
        
        return (response.data.files || []).map(f => ({
          ...f,
          accountId: account.id,
          accountEmail: account.email
        }));
      } catch (e) {
        console.error(`Failed to list files for ${account.email}`, e);
        return [];
      }
    });

    const results = await Promise.all(filesPromises);
    const allFiles = results.flat();

    // Sort by createdTime descending
    allFiles.sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());

    res.json({ files: allFiles });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// 3. File Upload
router.post('/upload', upload.single('file'), async (req, res) => {
  const file = req.file;
  const { virtualFolderId } = req.body;

  if (!file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const accounts = await prisma.googleAccount.findMany();
    let bestAccount = accounts[0];
    let maxFreeSpace = 0;

    // Find account with most free space
    for (const account of accounts) {
      const drive = getDriveClient(account.accessToken, account.refreshToken);
      const quota = await getStorageQuota(drive);
      if (quota && quota.limit && quota.usage) {
        const freeSpace = parseInt(quota.limit) - parseInt(quota.usage);
        if (freeSpace > maxFreeSpace) {
          maxFreeSpace = freeSpace;
          bestAccount = account;
        }
      }
    }

    if (!bestAccount) {
      return res.status(500).json({ error: 'No connected accounts' });
    }

    // Upload to best account
    const drive = getDriveClient(bestAccount.accessToken, bestAccount.refreshToken);
    const fileMetadata = { name: file.originalname };
    const media = {
      mimeType: file.mimetype,
      body: fs.createReadStream(file.path),
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id',
    });

    // Clean up temp file
    fs.unlinkSync(file.path);

    res.json({ success: true, fileId: response.data.id, accountId: bestAccount.id });
  } catch (error) {
    console.error('Upload error', error);
    if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// 4. File Download
router.get('/download/:accountId/:fileId', async (req, res) => {
  try {
    const { accountId, fileId } = req.params;
    const account = await prisma.googleAccount.findUnique({ where: { id: accountId } });
    
    if (!account) return res.status(404).json({ error: 'Account not found' });
    
    const drive = getDriveClient(account.accessToken, account.refreshToken);
    const file = await drive.files.get({ fileId, fields: 'name, mimeType' });
    
    res.setHeader('Content-disposition', `attachment; filename="${file.data.name}"`);
    res.setHeader('Content-type', file.data.mimeType || 'application/octet-stream');
    
    const response = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );
    
    response.data
      .on('end', () => {})
      .on('error', (err: any) => {
        console.error('Download stream error', err);
      })
      .pipe(res);
      
  } catch (error) {
    console.error('Download error', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

export default router;
