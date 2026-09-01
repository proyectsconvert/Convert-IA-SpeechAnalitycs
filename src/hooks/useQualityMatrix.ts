import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  QualityMatrixVersion,
  QualityMatrixSection,
  QualityMatrixItem,
} from "@/components/analizador-total/quality/types";
import { DEFAULT_QUALITY_BLOCKS } from "@/lib/analizador-total/macroprocesoConfigs";

export function useActiveMatrix(accountId: string | undefined) {
  return useQuery({
    queryKey: ["quality-matrix-active", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      if (!accountId) return null;
      const { data: version, error } = await supabase
        .from("quality_matrix_versions")
        .select("*")
        .eq("account_id", accountId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!version) {
        return { version: null, sections: [], items: [] } as {
          version: QualityMatrixVersion | null;
          sections: QualityMatrixSection[];
          items: QualityMatrixItem[];
        };
      }

      const { data: sections } = await supabase
        .from("quality_matrix_sections")
        .select("*")
        .eq("version_id", version.id)
        .order("sort_order");

      const sectionIds = (sections ?? []).map((s) => s.id);
      const { data: items } = sectionIds.length
        ? await supabase
            .from("quality_matrix_items")
            .select("*")
            .in("section_id", sectionIds)
            .order("sort_order")
        : { data: [] as QualityMatrixItem[] };

      return {
        version: version as QualityMatrixVersion,
        sections: (sections ?? []) as QualityMatrixSection[],
        items: (items ?? []) as QualityMatrixItem[],
      };
    },
  });
}

export function useSeedMatrix(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!accountId) throw new Error("No account");

      // Desactivar versiones previas
      await supabase
        .from("quality_matrix_versions")
        .update({ is_active: false })
        .eq("account_id", accountId);

      // Obtener el mayor número de versión existente
      const { data: latestVersions } = await supabase
        .from("quality_matrix_versions")
        .select("version")
        .eq("account_id", accountId)
        .order("version", { ascending: false })
        .limit(1);

      const nextVersion = (latestVersions?.[0]?.version ?? 0) + 1;

      // 1. Crear nueva versión activa global
      const { data: version, error: vErr } = await supabase
        .from("quality_matrix_versions")
        .insert({
          account_id: accountId,
          version: nextVersion,
          label: "Matriz Global de Calidad y Experiencia",
          is_active: true,
        })
        .select()
        .single();

      if (vErr) {
        // Fallback to rpc if direct insert fails
        const { data: rpcData, error: rpcErr } = await supabase.rpc("seed_quality_matrix", { p_account_id: accountId });
        if (rpcErr) throw rpcErr;
        return rpcData;
      }

      // 2. Insertar secciones e items estandarizados (regulares y críticos)
      for (let i = 0; i < DEFAULT_QUALITY_BLOCKS.length; i++) {
        const block = DEFAULT_QUALITY_BLOCKS[i];
        const isCritical = block.kind === "critical";
        const { data: sec, error: sErr } = await supabase
          .from("quality_matrix_sections")
          .insert({
            version_id: version.id,
            name: block.title,
            kind: block.kind || "regular",
            sort_order: isCritical ? 10 + i : i + 1,
          })
          .select()
          .single();

        if (sErr || !sec) continue;

        const itemsToInsert = block.questions.map((q, idx) => ({
          section_id: sec.id,
          attribute: q.text,
          sub_attribute: isCritical ? "Error Crítico" : `${block.weightPct}% del total`,
          description: q.description || block.description,
          max_score: q.weight,
          affectation: q.affectation || (isCritical ? "critico" : "none"),
          is_active: true,
          sort_order: idx + 1,
        }));

        await supabase.from("quality_matrix_items").insert(itemsToInsert);
      }

      return version;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quality-matrix-active", accountId] }),
  });
}

export function useCreateEmptyMatrix(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!accountId) throw new Error("No account");

      // Desactivar versiones previas (mantiene intactas las evaluaciones históricas)
      await supabase
        .from("quality_matrix_versions")
        .update({ is_active: false })
        .eq("account_id", accountId);

      // Obtener el mayor número de versión existente
      const { data: latestVersions } = await supabase
        .from("quality_matrix_versions")
        .select("version")
        .eq("account_id", accountId)
        .order("version", { ascending: false })
        .limit(1);

      const nextVersion = (latestVersions?.[0]?.version ?? 0) + 1;

      // 1. Crear nueva versión activa en blanco
      const { data: version, error: vErr } = await supabase
        .from("quality_matrix_versions")
        .insert({
          account_id: accountId,
          version: nextVersion,
          label: `Matriz Manual v${nextVersion}`,
          is_active: true,
        })
        .select()
        .single();

      if (vErr) throw vErr;

      // 2. Crear un bloque inicial en blanco para comenzar
      const { data: sec, error: sErr } = await supabase
        .from("quality_matrix_sections")
        .insert({
          version_id: version.id,
          name: "1. Nuevo Bloque de Evaluación",
          kind: "regular",
          sort_order: 1,
        })
        .select()
        .single();

      if (!sErr && sec) {
        await supabase.from("quality_matrix_items").insert({
          section_id: sec.id,
          attribute: "Criterio de evaluación 1",
          description: "Descripción de la evidencia esperada...",
          max_score: 10,
          affectation: "none",
          is_active: true,
          sort_order: 1,
        });
      }

      return version;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quality-matrix-active", accountId] }),
  });
}

export function useUpsertSection(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<QualityMatrixSection> & { version_id: string }) => {
      if (payload.id) {
        const { error } = await supabase
          .from("quality_matrix_sections")
          .update({ name: payload.name, kind: payload.kind, sort_order: payload.sort_order })
          .eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("quality_matrix_sections")
          .insert({
            version_id: payload.version_id,
            name: payload.name || "Nuevo bloque",
            kind: payload.kind || "regular",
            sort_order: payload.sort_order || 99,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quality-matrix-active", accountId] }),
  });
}

export function useDeleteSection(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quality_matrix_sections").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quality-matrix-active", accountId] }),
  });
}

export function useUpsertItem(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<QualityMatrixItem> & { section_id: string }) => {
      if (payload.id) {
        const { error } = await supabase
          .from("quality_matrix_items")
          .update({
            attribute: payload.attribute,
            sub_attribute: payload.sub_attribute ?? null,
            description: payload.description ?? null,
            max_score: payload.max_score ?? 0,
            affectation: payload.affectation ?? "none",
            is_active: payload.is_active ?? true,
            sort_order: payload.sort_order ?? 0,
          })
          .eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("quality_matrix_items").insert({
          section_id: payload.section_id,
          attribute: payload.attribute || "Nueva validación",
          sub_attribute: payload.sub_attribute ?? null,
          description: payload.description ?? null,
          max_score: payload.max_score ?? 10,
          affectation: payload.affectation ?? "none",
          is_active: payload.is_active ?? true,
          sort_order: payload.sort_order ?? 99,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quality-matrix-active", accountId] }),
  });
}

export function useDeleteItem(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quality_matrix_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quality-matrix-active", accountId] }),
  });
}
