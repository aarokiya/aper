import { initializeDatabase, dbPath } from '@/lib/db/client';
import { applyProjectPriorities } from '@/lib/db/queries';
initializeDatabase();
applyProjectPriorities();
console.log(`Database ready: ${dbPath}`);
