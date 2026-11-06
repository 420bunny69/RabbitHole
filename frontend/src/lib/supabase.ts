import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

export class SupabaseConfigurationError extends Error {
  constructor() {
    super(
      'Supabase authentication is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local, then restart Vite.',
    )
    this.name = 'SupabaseConfigurationError'
  }
}

export const supabaseConfigurationError =
  supabaseUrl && supabaseAnonKey ? null : new SupabaseConfigurationError()

export const supabase: SupabaseClient | null = supabaseConfigurationError
  ? null
  : createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    })

export function requireSupabaseClient(): SupabaseClient {
  if (!supabase) throw supabaseConfigurationError
  return supabase
}

export async function getCurrentAccessToken(): Promise<string | null> {
  const { data, error } = await requireSupabaseClient().auth.getSession()
  if (error) throw error
  return data.session?.access_token ?? null
}