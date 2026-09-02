import { createClient } from '@libsql/client';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

async function setup() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    console.error('Missing TURSO credentials in .env');
    process.exit(1);
  }

  const client = createClient({ url, authToken });

  console.log('Connecting to Turso...');
  
  try {
    const sqlPath = path.join(__dirname, '../setup-v3.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Split by semicolon and remove comments/empty lines
    const statements = sql
      .split(';')
      .map(s => s.replace(/--.*/g, '').trim())
      .filter(s => s.length > 0);
      
    console.log(`Executing ${statements.length} statements...`);
    for (const stmt of statements) {
      await client.execute(stmt);
    }
    
    console.log('✅ Successfully created tables on Turso!');
  } catch (error) {
    console.error('❌ Failed to execute schema on Turso:', error);
  }
}

setup();
