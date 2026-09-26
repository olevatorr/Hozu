import { z } from 'zod'

export const ServerEnv = z.object({ STOCK_LIMIT: z.coerce.number().int().positive().default(10) })
export const PublicEnv = z.object({ SUPPORT_EMAIL: z.string().email().default('help@cart.hozu.dev') })
