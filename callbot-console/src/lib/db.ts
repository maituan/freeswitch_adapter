import { Pool } from 'pg'
import config from './config'

let pool: Pool | null = null

function createPool(): Pool {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is not set')
  }
  return new Pool({ connectionString: config.databaseUrl })
}

export function getPool(): Pool {
  if (!pool) {
    pool = createPool()
  }
  return pool
}

export default getPool


