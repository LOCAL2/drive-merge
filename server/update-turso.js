const { createClient } = require('@libsql/client');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
const urlMatch = env.match(/TURSO_DATABASE_URL="([^"]+)"/);
const tokenMatch = env.match(/TURSO_AUTH_TOKEN="([^"]+)"/);

if (!urlMatch || !tokenMatch) {
  console.error("Missing Turso credentials in .env");
  process.exit(1);
}

const client = createClient({
  url: urlMatch[1],
  authToken: tokenMatch[1],
});

async function run() {
  console.log("Updating Turso Schema...");
  try {
    // Add status to GoogleAccount
    try {
      await client.execute(`ALTER TABLE "GoogleAccount" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';`);
      console.log("Added status column to GoogleAccount");
    } catch (e) {
      if (e.message.includes('duplicate column')) {
        console.log("status column already exists");
      } else {
        console.log("Status column error:", e.message);
      }
    }

    // Create ActivityLog table
    try {
      await client.execute(`
        CREATE TABLE IF NOT EXISTS "ActivityLog" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "action" TEXT NOT NULL,
          "fileName" TEXT,
          "fileId" TEXT,
          "sourceAccountId" TEXT,
          "targetAccountId" TEXT,
          "details" TEXT,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ActivityLog_sourceAccountId_fkey" FOREIGN KEY ("sourceAccountId") REFERENCES "GoogleAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
        );
      `);
      console.log("Created ActivityLog table");
    } catch (e) {
      console.log("ActivityLog table error:", e.message);
    }

    console.log("Done!");
  } catch (e) {
    console.error("Failed to update schema", e);
  }
}

run();
