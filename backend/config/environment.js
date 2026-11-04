import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.NODE_ENV !== 'test') {
  const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  dotenv.config({ path: path.join(directory, '.env') });
  dotenv.config({ path: path.join(directory, process.env.NODE_ENV === 'production' ? 'config.production.env' : 'config.env') });
}
