const { execSync } = require('child_process');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
const urlMatch = env.match(/TURSO_DATABASE_URL="([^"]+)"/);
const tokenMatch = env.match(/TURSO_AUTH_TOKEN="([^"]+)"/);

if (!urlMatch || !tokenMatch) {
  console.error("Missing Turso credentials in .env");
  process.exit(1);
}

const dbUrl = urlMatch[1] + '?authToken=' + tokenMatch[1];
console.log("Pushing schema to Turso...");
try {
  execSync('npx prisma db push', {
    env: { ...process.env, PRISMA_DATABASE_URL: dbUrl },
    stdio: 'inherit'
  });
  console.log("Success!");
} catch (e) {
  console.error("Failed", e);
}
