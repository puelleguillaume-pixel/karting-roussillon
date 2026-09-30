/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_SOURCE?: 'supabase' | 'demo' | '';
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SITE_URL?: string;
  readonly VITE_GOOGLE_ADS_ID?: string;
  readonly VITE_GOOGLE_ADS_BOOKING_LABEL?: string;
  readonly VITE_GOOGLE_ADS_GIFT_LABEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
