import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // DDL/迁移走 session pooler（DIRECT_URL），避开 transaction pooler 的语句限制
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
  },
})
