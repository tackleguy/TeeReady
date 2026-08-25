/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SWING_LLM_URL?: string;
  readonly VITE_SWING_LLM_MODEL?: string;
  readonly VITE_SWING_LLM_MODEL_ASSESSMENT?: string;
  readonly VITE_SWING_LLM_MODEL_ROOT_CAUSE?: string;
  readonly VITE_SWING_LLM_MODEL_WHY_DRILLS?: string;
  readonly VITE_SWING_LLM_MODEL_WEEKLY?: string;
  readonly VITE_SWING_LLM_MODEL_VISUAL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
