import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/auth/google/callback'
);

export const getAuthUrl = () => {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // Force to get refresh token
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
      'https://www.googleapis.com/auth/drive',
    ],
  });
};

export const getTokens = async (code: string) => {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
};

export const getDriveClient = (accessToken: string, refreshToken: string) => {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  return google.drive({ version: 'v3', auth: client });
};

export const getStorageQuota = async (drive: any) => {
  try {
    const res = await drive.about.get({
      fields: 'storageQuota, user',
    });
    return {
      limit: res.data.storageQuota.limit,
      usage: res.data.storageQuota.usage,
      user: res.data.user,
    };
  } catch (error) {
    console.error('Error fetching storage quota', error);
    return null;
  }
};
