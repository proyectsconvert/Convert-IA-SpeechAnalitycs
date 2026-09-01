import { supabase } from "@/integrations/supabase/client";

export type ProcessCallBody = {
  audio_file_id: string;
  account_id: string;
  prompt_id?: string | null;
};

export type InvokeProcessCallOptions = {
  /** Si true, no llama a refreshSession (útil en lotes paralelos; refresca antes una vez). */
  skipRefresh?: boolean;
};

/**
 * Invoca process-call con Bearer explícito usando la sesión actual.
 * NO hace refreshSession() manual para evitar invalidar tokens en otras pestañas.
 * El cliente Supabase maneja el refresh automáticamente.
 */
export async function invokeProcessCall(body: ProcessCallBody, options?: InvokeProcessCallOptions) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { data: null, error: new Error("Sesión no válida. Vuelve a iniciar sesión.") };
  }
  return supabase.functions.invoke("process-call", {
    body,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });
}
