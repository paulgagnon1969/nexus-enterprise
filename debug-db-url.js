console.log('process.env.DATABASE_URL =', process.env.DATABASE_URL);
try {
  const db = require('./packages/database/dist/client.js');
  console.log('Loaded prisma default export type:', typeof db.default || typeof db);
} catch (err) {
  console.error('Error requiring @repo/database client:', err);
}
