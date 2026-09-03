import { Router } from 'express';
import prisma from '../db';
import { getDriveClient, getStorageQuota } from '../services/google';
import multer from 'multer';
import fs from 'fs';
const { ZipArchive } = require('archiver');

const router = Router();
const upload = multer({ dest: 'uploads/' }); // Temporary storage for uploads

router.use((req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// 1. Get Merged Quota
router.get('/quota', async (req, res) => {
  try {
    const accounts = await prisma.googleAccount.findMany({ where: { userId: req.session.userId } });
    
    const quotaPromises = accounts.map(async (account) => {
      const drive = getDriveClient(account.accessToken, account.refreshToken);
      const quota = await getStorageQuota(drive);
      if (quota && quota.limit) {
        return {
          id: account.id,
          email: account.email,
          limit: quota.limit,
          usage: quota.usage,
          photoLink: quota.user?.photoLink || null
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
    const { folderId, accountId, starred } = req.query;
    const accounts = await prisma.googleAccount.findMany({ where: { status: 'active', userId: req.session.userId } });
    
    const filesPromises = accounts.map(async (account) => {
      if (accountId && accountId !== account.id) return [];
      const drive = getDriveClient(account.accessToken, account.refreshToken);
      try {
        let q = "trashed = false";
        if (folderId) {
          q += ` and '${folderId}' in parents`;
        } else if (starred === 'true') {
          q += ` and starred = true`;
        }

        const response = await drive.files.list({
          pageSize: 100,
          fields: 'nextPageToken, files(id, name, mimeType, size, webViewLink, webContentLink, createdTime, hasThumbnail, thumbnailLink, iconLink, parents, starred)',
          q: q,
        });
        
        return (response.data.files || []).map(f => ({
          ...f,
          accountId: account.id,
          accountEmail: account.email
        }));
      } catch (e: any) {
        console.error(`Failed to list files for ${account.email}`, e);
        if (e.status === 401 || e.code === 401) {
          await prisma.googleAccount.update({ where: { id: account.id }, data: { status: 'invalid' } });
        }
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
    const accounts = await prisma.googleAccount.findMany({ where: { userId: req.session.userId } });
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
    const originalNameUtf8 = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    
    const fileMetadata = {
      name: originalNameUtf8,
    };
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

    await prisma.activityLog.create({
      data: {
        action: 'UPLOAD',
        fileName: file.originalname,
        fileId: response.data.id,
        sourceAccountId: bestAccount.id,
      }
    });

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
    const account = await prisma.googleAccount.findFirst({ where: { id: accountId, userId: req.session.userId } });
    
    if (!account) return res.status(404).json({ error: 'Account not found' });
    
    const drive = getDriveClient(account.accessToken, account.refreshToken);
    const file = await drive.files.get({ fileId, fields: 'name, mimeType' });
    
    const isInline = req.query.inline === 'true';
    res.setHeader('Content-disposition', `${isInline ? 'inline' : 'attachment'}; filename="${file.data.name}"`);
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

// 5. Cross-Account File Transfer (Copy or Move)
router.post('/transfer', async (req, res) => {
  try {
    const { fileId, sourceAccountId, targetAccountId, action = 'copy' } = req.body;

    if (!fileId || !sourceAccountId || !targetAccountId) {
      return res.status(400).json({ error: 'fileId, sourceAccountId, and targetAccountId are required' });
    }

    if (sourceAccountId === targetAccountId) {
      return res.status(400).json({ error: 'Source and target accounts must be different' });
    }

    const [sourceAccount, targetAccount] = await Promise.all([
      prisma.googleAccount.findFirst({ where: { id: sourceAccountId, userId: req.session.userId } }),
      prisma.googleAccount.findFirst({ where: { id: targetAccountId, userId: req.session.userId } })
    ]);

    if (!sourceAccount) return res.status(404).json({ error: 'Source account not found' });
    if (!targetAccount) return res.status(404).json({ error: 'Target account not found' });

    const sourceDrive = getDriveClient(sourceAccount.accessToken, sourceAccount.refreshToken);
    const targetDrive = getDriveClient(targetAccount.accessToken, targetAccount.refreshToken);

    // Get source file metadata
    const sourceMeta = await sourceDrive.files.get({
      fileId,
      fields: 'id, name, mimeType, description'
    });

    const fileName = sourceMeta.data.name || 'Untitled';
    const mimeType = sourceMeta.data.mimeType || 'application/octet-stream';

    // Google Docs/Sheets/Slides cannot be directly exported via alt=media without conversion,
    // so we handle standard files stream or export for Google Workspace formats
    let mediaStream: any;
    let uploadMimeType = mimeType;
    let targetFileName = fileName;

    if (mimeType.startsWith('application/vnd.google-apps.')) {
      // Export Google Workspace formats
      if (mimeType.includes('document')) {
        uploadMimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        if (!targetFileName.endsWith('.docx')) targetFileName += '.docx';
      } else if (mimeType.includes('spreadsheet')) {
        uploadMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        if (!targetFileName.endsWith('.xlsx')) targetFileName += '.xlsx';
      } else if (mimeType.includes('presentation')) {
        uploadMimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        if (!targetFileName.endsWith('.pptx')) targetFileName += '.pptx';
      } else {
        uploadMimeType = 'application/pdf';
        if (!targetFileName.endsWith('.pdf')) targetFileName += '.pdf';
      }

      const exportResponse = await sourceDrive.files.export(
        { fileId, mimeType: uploadMimeType },
        { responseType: 'stream' }
      );
      mediaStream = exportResponse.data;
    } else {
      // Standard binary files download stream
      const getResponse = await sourceDrive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' }
      );
      mediaStream = getResponse.data;
    }

    // Upload to target account
    const createResponse = await targetDrive.files.create({
      requestBody: {
        name: targetFileName,
        mimeType: uploadMimeType,
        description: sourceMeta.data.description || undefined
      },
      media: {
        mimeType: uploadMimeType,
        body: mediaStream
      },
      fields: 'id, name, webViewLink'
    });

    // If action is 'move', delete from source account
    if (action === 'move') {
      try {
        await sourceDrive.files.delete({ fileId });
      } catch (delError) {
        console.error('Failed to delete source file after transfer:', delError);
      }
    }

    await prisma.activityLog.create({
      data: {
        action: action === 'move' ? 'TRANSFER_MOVE' : 'TRANSFER_COPY',
        fileName: targetFileName,
        fileId: createResponse.data.id,
        sourceAccountId: sourceAccountId,
        targetAccountId: targetAccountId,
      }
    });

    res.json({
      success: true,
      action,
      newFileId: createResponse.data.id,
      fileName: createResponse.data.name,
      targetAccountId: targetAccount.id
    });
  } catch (error: any) {
    console.error('Transfer error:', error);
    res.status(500).json({ error: error?.message || 'Transfer failed' });
  }
});

// 6. Batch Delete
router.post('/batch-delete', async (req, res) => {
  try {
    const { files } = req.body as { files: Array<{ fileId: string; accountId: string }> };

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'files array is required' });
    }

    const accounts = await prisma.googleAccount.findMany({ where: { userId: req.session.userId } });
    const accountMap = new Map(accounts.map(a => [a.id, a]));

    const results = await Promise.all(
      files.map(async (item) => {
        const account = accountMap.get(item.accountId);
        if (!account) {
          return { fileId: item.fileId, success: false, error: 'Account not found' };
        }
        try {
          const drive = getDriveClient(account.accessToken, account.refreshToken);
          await drive.files.delete({ fileId: item.fileId });
          return { fileId: item.fileId, success: true };
        } catch (err: any) {
          return { fileId: item.fileId, success: false, error: err?.message || 'Delete failed' };
        }
      })
    );

    const successCount = results.filter(r => r.success).length;
    res.json({
      success: true,
      total: files.length,
      successCount,
      failedCount: files.length - successCount,
      details: results
    });
  } catch (error: any) {
    console.error('Batch delete error:', error);
    res.status(500).json({ error: error?.message || 'Batch delete failed' });
  }
});

// 7. Batch Transfer (Copy or Move)
router.post('/batch-transfer', async (req, res) => {
  try {
    const { files, targetAccountId, action = 'copy' } = req.body as {
      files: Array<{ fileId: string; sourceAccountId: string; name?: string }>;
      targetAccountId: string;
      action?: 'copy' | 'move';
    };

    if (!files || !Array.isArray(files) || files.length === 0 || !targetAccountId) {
      return res.status(400).json({ error: 'files array and targetAccountId are required' });
    }

    const targetAccount = await prisma.googleAccount.findFirst({ where: { id: targetAccountId, userId: req.session.userId } });
    if (!targetAccount) return res.status(404).json({ error: 'Target account not found' });

    const targetDrive = getDriveClient(targetAccount.accessToken, targetAccount.refreshToken);
    const accounts = await prisma.googleAccount.findMany({ where: { userId: req.session.userId } });
    const accountMap = new Map(accounts.map(a => [a.id, a]));

    const results = [];
    for (const item of files) {
      if (item.sourceAccountId === targetAccountId) {
        results.push({ fileId: item.fileId, success: false, error: 'Source and target account are the same' });
        continue;
      }

      const sourceAccount = accountMap.get(item.sourceAccountId);
      if (!sourceAccount) {
        results.push({ fileId: item.fileId, success: false, error: 'Source account not found' });
        continue;
      }

      try {
        const sourceDrive = getDriveClient(sourceAccount.accessToken, sourceAccount.refreshToken);
        const sourceMeta = await sourceDrive.files.get({
          fileId: item.fileId,
          fields: 'id, name, mimeType, description'
        });

        const fileName = sourceMeta.data.name || item.name || 'Untitled';
        const mimeType = sourceMeta.data.mimeType || 'application/octet-stream';

        let mediaStream: any;
        let uploadMimeType = mimeType;
        let targetFileName = fileName;

        if (mimeType.startsWith('application/vnd.google-apps.')) {
          if (mimeType.includes('document')) {
            uploadMimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            if (!targetFileName.endsWith('.docx')) targetFileName += '.docx';
          } else if (mimeType.includes('spreadsheet')) {
            uploadMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            if (!targetFileName.endsWith('.xlsx')) targetFileName += '.xlsx';
          } else if (mimeType.includes('presentation')) {
            uploadMimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
            if (!targetFileName.endsWith('.pptx')) targetFileName += '.pptx';
          } else {
            uploadMimeType = 'application/pdf';
            if (!targetFileName.endsWith('.pdf')) targetFileName += '.pdf';
          }

          const exportResponse = await sourceDrive.files.export(
            { fileId: item.fileId, mimeType: uploadMimeType },
            { responseType: 'stream' }
          );
          mediaStream = exportResponse.data;
        } else {
          const getResponse = await sourceDrive.files.get(
            { fileId: item.fileId, alt: 'media' },
            { responseType: 'stream' }
          );
          mediaStream = getResponse.data;
        }

        const createResponse = await targetDrive.files.create({
          requestBody: {
            name: targetFileName,
            mimeType: uploadMimeType,
            description: sourceMeta.data.description || undefined
          },
          media: {
            mimeType: uploadMimeType,
            body: mediaStream
          },
          fields: 'id, name'
        });

        if (action === 'move') {
          try {
            await sourceDrive.files.delete({ fileId: item.fileId });
          } catch (delError) {
            console.error('Failed to delete source file in batch transfer:', delError);
          }
        }

        results.push({
          fileId: item.fileId,
          newFileId: createResponse.data.id,
          name: targetFileName,
          success: true
        });
      } catch (err: any) {
        console.error(`Error transferring file ${item.fileId}:`, err);
        results.push({ fileId: item.fileId, success: false, error: err?.message || 'Transfer failed' });
      }
    }

    const successCount = results.filter(r => r.success).length;
    res.json({
      success: true,
      action,
      total: files.length,
      successCount,
      failedCount: files.length - successCount,
      details: results
    });
  } catch (error: any) {
    console.error('Batch transfer error:', error);
    res.status(500).json({ error: error?.message || 'Batch transfer failed' });
  }
});

// 8. Batch Download as ZIP
router.post('/batch-download-zip', async (req, res) => {
  try {
    const { files } = req.body as { files: Array<{ fileId: string; accountId: string; name: string }> };

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'files array is required' });
    }

    const accounts = await prisma.googleAccount.findMany({ where: { userId: req.session.userId } });
    const accountMap = new Map(accounts.map(a => [a.id, a]));

    const archive = new ZipArchive({ zlib: { level: 6 } });
    const zipName = `DriveMerge_Export_${Date.now()}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    archive.pipe(res);

    archive.on('error', (err) => {
      console.error('Archiver error:', err);
      res.end();
    });

    const usedNames = new Set<string>();

    for (const item of files) {
      const account = accountMap.get(item.accountId);
      if (!account) continue;

      try {
        const drive = getDriveClient(account.accessToken, account.refreshToken);
        const meta = await drive.files.get({ fileId: item.fileId, fields: 'name, mimeType' });

        let originalName = meta.data.name || item.name || 'file';
        const mimeType = meta.data.mimeType || '';

        let stream: any;
        if (mimeType.startsWith('application/vnd.google-apps.')) {
          let exportMime = 'application/pdf';
          let ext = '.pdf';
          if (mimeType.includes('document')) {
            exportMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            ext = '.docx';
          } else if (mimeType.includes('spreadsheet')) {
            exportMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            ext = '.xlsx';
          } else if (mimeType.includes('presentation')) {
            exportMime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
            ext = '.pptx';
          }
          if (!originalName.endsWith(ext)) originalName += ext;

          const exportRes = await drive.files.export({ fileId: item.fileId, mimeType: exportMime }, { responseType: 'stream' });
          stream = exportRes.data;
        } else {
          const downloadRes = await drive.files.get({ fileId: item.fileId, alt: 'media' }, { responseType: 'stream' });
          stream = downloadRes.data;
        }

        // Deduplicate filename inside zip if duplicate names exist
        let finalZipEntryName = originalName;
        let counter = 1;
        while (usedNames.has(finalZipEntryName)) {
          const dotIdx = originalName.lastIndexOf('.');
          if (dotIdx > 0) {
            finalZipEntryName = `${originalName.substring(0, dotIdx)} (${counter})${originalName.substring(dotIdx)}`;
          } else {
            finalZipEntryName = `${originalName} (${counter})`;
          }
          counter++;
        }
        usedNames.add(finalZipEntryName);

        archive.append(stream, { name: finalZipEntryName });
      } catch (fileErr) {
        console.error(`Failed to pack file ${item.fileId} to zip:`, fileErr);
      }
    }

    await archive.finalize();
  } catch (error: any) {
    console.error('Batch download zip error:', error);
    fs.writeFileSync('error.txt', error?.stack || error?.message || String(error));
    if (!res.headersSent) {
      res.status(500).json({ error: error?.message || 'Failed to generate zip' });
    }
  }
});

// 9. Empty Trash
router.post('/empty-trash', async (req, res) => {
  try {
    const accounts = await prisma.googleAccount.findMany({ where: { status: 'active', userId: req.session.userId } });
    
    const results = await Promise.all(
      accounts.map(async (account) => {
        try {
          const drive = getDriveClient(account.accessToken, account.refreshToken);
          await drive.files.emptyTrash({});
          return { accountId: account.id, success: true };
        } catch (e: any) {
          return { accountId: account.id, success: false, error: e.message };
        }
      })
    );

    await prisma.activityLog.create({
      data: {
        action: 'EMPTY_TRASH',
        details: `Emptied trash across ${results.filter(r => r.success).length} accounts`
      }
    });

    res.json({ success: true, results });
  } catch (error) {
    console.error('Empty trash error:', error);
    res.status(500).json({ error: 'Failed to empty trash' });
  }
});

// 10. Star / Unstar File
router.post('/star', async (req, res) => {
  try {
    const { fileId, accountId, starred } = req.body;
    if (!fileId || !accountId || starred === undefined) {
      return res.status(400).json({ error: 'fileId, accountId, and starred are required' });
    }

    const account = await prisma.googleAccount.findFirst({ where: { id: accountId, userId: req.session.userId } });
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const drive = getDriveClient(account.accessToken, account.refreshToken);
    await drive.files.update({
      fileId,
      requestBody: { starred }
    });

    await prisma.activityLog.create({
      data: {
        action: starred ? 'STAR' : 'UNSTAR',
        fileId,
        sourceAccountId: accountId
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Star error:', error);
    res.status(500).json({ error: 'Failed to update star status' });
  }
});

// 11. Activity Logs
router.get('/activity-logs', async (req, res) => {
  try {
    const logs = await prisma.activityLog.findMany({
      where: { googleAccount: { userId: req.session.userId } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { googleAccount: { select: { email: true } } }
    });
    res.json({ logs });
  } catch (error) {
    console.error('Activity logs error:', error);
    res.status(500).json({ error: 'Failed to fetch activity logs' });
  }
});

export default router;

