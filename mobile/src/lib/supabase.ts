import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type SupabaseMemberRow = {
  id: string;
  family_id: string;
  name: string;
  role: string;
  status: string;
  battery: number;
  lat: number | null;
  lng: number | null;
  updated_at: string;
};

export type SupabaseMessageRow = {
  id: string;
  family_id: string;
  sender_name: string;
  text: string;
  created_at: string;
};

export type SupabaseLocationRow = {
  id: string;
  family_id: string;
  member_id: string;
  lat: number;
  lng: number;
  accuracy_meters: number | null;
  speed_mps: number | null;
  observed_at: string;
};

export type SupabaseContactRow = {
  member_id: string;
  family_id: string;
  phone_e164: string | null;
  telegram_chat_id: string | null;
  home_lat: number | null;
  home_lng: number | null;
  work_lat: number | null;
  work_lng: number | null;
  role: string | null;
  priority: number | null;
};

export type SupabaseNotificationRow = {
  id: string;
  family_id: string;
  target_role: string;
  title: string;
  body: string;
  lat: number | null;
  lng: number | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      members: {
        Row: SupabaseMemberRow;
        Insert: Partial<Pick<SupabaseMemberRow, 'id' | 'updated_at'>> &
          Pick<SupabaseMemberRow, 'family_id' | 'name' | 'status' | 'battery'> & {
            lat?: number | null;
            lng?: number | null;
          };
        Update: Partial<Omit<SupabaseMemberRow, 'id'>>;
        Relationships: [];
      };
      messages: {
        Row: SupabaseMessageRow;
        Insert: Pick<SupabaseMessageRow, 'family_id' | 'sender_name' | 'text'>;
        Update: Partial<Omit<SupabaseMessageRow, 'id'>>;
        Relationships: [];
      };
      families: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
        };
        Update: {
          name?: string;
        };
        Relationships: [];
      };
      member_locations: {
        Row: SupabaseLocationRow;
        Insert: Omit<SupabaseLocationRow, 'id'> & { id?: string };
        Update: Partial<Omit<SupabaseLocationRow, 'id'>>;
        Relationships: [];
      };
      member_contacts: {
        Row: SupabaseContactRow;
        Insert: SupabaseContactRow;
        Update: Partial<SupabaseContactRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';
export const SUPABASE_FAMILY_ID = process.env.EXPO_PUBLIC_FAMILY_ID?.trim() ?? '';
export const SUPABASE_MEMBER_ID = process.env.EXPO_PUBLIC_MEMBER_ID?.trim() ?? '';
export const SUPABASE_MEMBER_NAME = process.env.EXPO_PUBLIC_MEMBER_NAME?.trim() || 'Mason';

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_FAMILY_ID,
);

export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    })
  : null;
