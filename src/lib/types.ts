export type Paginated<T> = {
  count: number
  next: string | null
  previous: string | null
  results: T[]
  total_amount?: number
  total_count?: number
  page?: number
  page_size?: number
}

export type AdminUser = {
  id: number
  phone_number: string
  unique_id?: string | null
  first_name: string
  last_name: string
  email?: string | null
  roles: string[]
  is_active: boolean
  is_banned: boolean
  is_staff: boolean
  is_verified: boolean
  date_joined: string
  plan: 'free' | 'premium'
  stream_quality: 'medium' | 'high'
  last_login_at?: string | null
  failed_login_attempts?: number
  locked_until?: string | null
  has_artist_profile?: boolean
  artist_verified?: boolean | null
}

export type Artist = {
  id: number
  user?: number | null
  user_phone?: string | null
  user_is_banned?: boolean | null
  name: string
  name_en?: string
  artistic_name?: string
  artistic_name_en?: string
  email?: string | null
  city?: string
  city_en?: string
  date_of_birth?: string | null
  address?: string
  address_en?: string
  id_number?: string
  bio?: string
  bio_en?: string
  profile_image?: string | null
  banner_image?: string | null
  verified: boolean
  created_at: string
  has_user?: boolean
}

export type ArtistAuth = Record<string, unknown> & {
  id: number
  user?: number | null
  auth_type?: string
  artist_claimed?: number | null
  first_name?: string
  first_name_en?: string
  last_name?: string
  last_name_en?: string
  stage_name?: string
  stage_name_en?: string
  birth_date?: string | null
  national_id?: string
  phone_number?: string
  email?: string
  city?: string
  city_en?: string
  address?: string
  address_en?: string
  biography?: string
  biography_en?: string
  profile_image?: string | null
  national_id_image?: string | null
  status: string
  is_verified: boolean
  created_at: string
  updated_at: string
}

export type Song = Record<string, unknown> & {
  id: number
  title: string
  title_en?: string
  artist: number
  artist_name: string
  album?: number | null
  album_title?: string | null
  featured_artists?: Array<{id:number;name:string;artistic_name?:string}>
  is_single?: boolean
  album_disc_number?: number
  album_track_number?: number
  genres?: number[]
  sub_genres?: number[]
  moods?: number[]
  tags?: number[]
  description?: string
  description_en?: string
  lyrics?: string
  lyrics_en?: string
  label?: string
  label_en?: string
  producers?: string[]
  producers_en?: string[]
  composers?: string[]
  composers_en?: string[]
  lyricists?: string[]
  lyricists_en?: string[]
  credits?: string
  credits_en?: string
  live_performed?: boolean
  original_format?: string | null
  cover_image?: string | null
  audio_file?: string | null
  converted_audio_url?: string | null
  duration_seconds?: number | null
  plays: number
  likes_count?: number
  metadata_completion?: number
  genre_names?: string[]
  sub_genre_names?: string[]
  mood_names?: string[]
  tempo?: number | null
  energy?: number | null
  danceability?: number | null
  valence?: number | null
  acousticness?: number | null
  instrumentalness?: number | null
  speechiness?: number | null
  status: string
  release_date?: string | null
  language?: string
  created_at: string
  updated_at: string
}

export type Album = Record<string, unknown> & {
  id: number
  title: string
  title_en?: string
  artist: number
  artist_name: string
  cover_image?: string | null
  release_date?: string | null
  description?: string
  description_en?: string
  created_at: string
  songs: Song[]
  is_removed?: boolean
}

export type PaymentTransaction = {
  id: number
  user: number
  user_phone: string
  user_plan: string
  transaction_id: string
  amount: number | string
  status: string
  payment_method?: string | null
  description?: string
  created_at: string
}

export type DepositRequest = {
  id: number
  artist: number
  artist_name: string
  artist_phone?: string | null
  amount: number | string
  status: string
  transaction_id?: string | null
  submission_date: string
  status_change_date?: string | null
  summary?: Record<string, unknown>
}

export type SupportTicket = {
  id: number
  user: number
  user_phone: string
  artist_name?: string
  subject: string
  message: string
  status: string
  admin_response?: string
  responded_by_phone?: string | null
  responded_at?: string | null
  created_at: string
  updated_at: string
}

export type Report = {
  id: number
  user_phone: string
  song?: number | null
  song_title?: string | null
  artist?: number | null
  artist_name?: string | null
  reported_user?: number | null
  reported_user_phone?: string | null
  reported_user_unique_id?: string | null
  reported_user_name?: string | null
  text: string
  has_reviewed: boolean
  reviewed_at?: string | null
  created_at: string
}

export type Promotion = {
  id: number
  song: number
  song_title: string
  artist_name: string
  cover_image?: string | null
  aggression: number
  starts_at: string
  ends_at: string
  is_active: boolean
  is_running: boolean
  created_at: string
  updated_at: string
}

export type SystemStatus = {
  api: { ok: boolean; label: string; detail: string }
  r2: { ok: boolean; label: string; detail: string; latency_ms?: number | null }
  checked_at: string
}

export type DashboardSummary = Record<string, unknown> & {
  users: { total: number; active: number; banned: number; premium: number; free: number; new_30_days: number }
  artists: { total: number; verified: number; pending_verification: number; successful: number; top: Array<{ id: number; name: string; profile_image?: string; verified: boolean; streams: number; earned: number }> }
  streams: { total: number; last_24_hours: number; last_7_days: number; last_30_days: number; artist_earned_total: number }
  money: { platform_revenue: number; revenue_30_days: number; successful_payments_count: number; pending_payments_count: number; failed_payments_count: number; artist_earned_total: number; artist_paid_total: number; artist_pending_payout_total: number; artist_pending_payout_count: number; gross_after_paid_payouts: number }
  recent_transactions: PaymentTransaction[]
  recent_payouts: DepositRequest[]
}
