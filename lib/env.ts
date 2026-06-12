import "server-only";
import { z } from "zod";

const envSchema = z.object({
  ADMIN_ACCESS_PASSWORD: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(32).optional(),
  DATABASE_URL: z.string().min(1).default("file:./data/workbench.sqlite"),
  AI_API_BASE_URL: z.string().url().optional(),
  AI_API_KEY: z.string().min(1).optional(),
  AI_MODEL: z.string().min(1).optional(),
  AI_SCHEMA_SOURCE_MAX_CHARS: z.coerce.number().int().min(20).default(51_200),
});

export type ServerEnv = z.infer<typeof envSchema>;

export function getServerEnv(): ServerEnv {
  return envSchema.parse(process.env);
}
