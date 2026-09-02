import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  QualityMatrixVersion,
  QualityMatrixSection,
  QualityMatrixItem,
} from "@/components/analizador-total/quality/types";
import { DEFAULT_QUALITY_BLOCKS } from "@/lib/analizador-total/macroprocesoConfigs";

/**
 * Consulta todas las matrices de calidad configuradas para una cuenta.
 */
export function useQualityMatrices(accountId: string | undefined) {
  return useQuery({
    queryKey: ["quality-matrices-all", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      if (!accountId) return [];
      const { data, error } = await supabase
        .from("quality_matrix_versions")
        .select("*")
        .eq("account_id", accountId)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as QualityMatrixVersion[];
    },
  });
}

/**
 * Consulta los detalles completos (secciones e ítems) de una matriz específica por ID.
 */
export function useMatrixDetails(versionId: string | undefined) {
  return useQuery({
    queryKey: ["quality-matrix-details", versionId],
    enabled: !!versionId,
    queryFn: async () => {
      if (!versionId) return null;

      const { data: version, error: vErr } = await supabase
        .from("quality_matrix_versions")
        .select("*")
        .eq("id", versionId)
        .single();

      if (vErr || !version) throw vErr || new Error("Matriz no encontrada");

      const { data: sections, error: sErr } = await supabase
        .from("quality_matrix_sections")
        .select("*")
        .eq("version_id", version.id)
        .order("sort_order");

      if (sErr) throw sErr;

      const sectionIds = (sections ?? []).map((s) => s.id);
      const { data: items, error: iErr } = sectionIds.length
        ? await supabase
            .from("quality_matrix_items")
            .select("*")
            .in("section_id", sectionIds)
            .order("sort_order")
        : { data: [] as QualityMatrixItem[], error: null };

      if (iErr) throw iErr;

      return {
        version: version as QualityMatrixVersion,
        sections: (sections ?? []) as QualityMatrixSection[],
        items: (items ?? []) as QualityMatrixItem[],
      };
    },
  });
}

/**
 * Consulta la matriz de calidad activa / predeterminada de la cuenta.
 */
export function useActiveMatrix(accountId: string | undefined) {
  return useQuery({
    queryKey: ["quality-matrix-active", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      if (!accountId) return null;
      
      // Buscar primero la que tenga is_default = true, o fallback a is_active
      let { data: version, error } = await supabase
        .from("quality_matrix_versions")
        .select("*")
        .eq("account_id", accountId)
        .eq("is_default", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !version) {
        const { data: fallback, error: fErr } = await supabase
          .from("quality_matrix_versions")
          .select("*")
          .eq("account_id", accountId)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (fErr) throw fErr;
        version = fallback;
      }

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

/**
 * Crea una nueva matriz de calidad (con plantilla estándar, en blanco o personalizada).
 */
export function useCreateMatrix(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      name: string;
      description?: string;
      macroproceso?: string;
      templateType: "standard" | "blank";
      isDefault?: boolean;
    }) => {
      if (!accountId) throw new Error("No hay cuenta seleccionada");

      // Si se marca como default, desmarcar las existentes
      if (payload.isDefault) {
        await supabase
          .from("quality_matrix_versions")
          .update({ is_default: false })
          .eq("account_id", accountId);
      }

      // Obtener el mayor número de versión existente
      const { data: latestVersions } = await supabase
        .from("quality_matrix_versions")
        .select("version")
        .eq("account_id", accountId)
        .order("version", { ascending: false })
        .limit(1);

      const nextVersion = (latestVersions?.[0]?.version ?? 0) + 1;

      // 1. Insertar nueva matriz
      const { data: version, error: vErr } = await supabase
        .from("quality_matrix_versions")
        .insert({
          account_id: accountId,
          version: nextVersion,
          label: payload.name.trim() || `Matriz de Calidad v${nextVersion}`,
          description: payload.description?.trim() || null,
          macroproceso: payload.macroproceso || "ventas",
          is_active: true,
          is_default: !!payload.isDefault,
        })
        .select()
        .single();

      if (vErr || !version) throw vErr || new Error("Error al crear matriz");

      // 2. Si es tipo standard, poblar con los bloques por defecto
      if (payload.templateType === "standard") {
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
      } else {
        // En blanco: agregar 1 sección inicial
        const { data: sec } = await supabase
          .from("quality_matrix_sections")
          .insert({
            version_id: version.id,
            name: "1. Criterios Iniciales",
            kind: "regular",
            sort_order: 1,
          })
          .select()
          .single();

        if (sec) {
          await supabase.from("quality_matrix_items").insert({
            section_id: sec.id,
            attribute: "Criterio de evaluación 1",
            description: "Descripción de la evidencia requerida...",
            max_score: 10,
            affectation: "none",
            is_active: true,
            sort_order: 1,
          });
        }
      }

      return version;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quality-matrices-all", accountId] });
      qc.invalidateQueries({ queryKey: ["quality-matrix-active", accountId] });
    },
  });
}

/**
 * Duplica una matriz existente con todas sus secciones e items.
 */
export function useDuplicateMatrix(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { sourceVersionId: string; newLabel?: string }) => {
      if (!accountId) throw new Error("No hay cuenta");

      // Intentar RPC si está disponible
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc("duplicate_quality_matrix", {
          p_source_version_id: payload.sourceVersionId,
          p_new_label: payload.newLabel || null,
          p_account_id: accountId,
        });
        if (!rpcErr && rpcRes) return { id: rpcRes };
      } catch {
        // Fallback a clonación manual directa
      }

      // 1. Obtener origen
      const { data: source, error: srcErr } = await supabase
        .from("quality_matrix_versions")
        .select("*")
        .eq("id", payload.sourceVersionId)
        .single();

      if (srcErr || !source) throw srcErr || new Error("Matriz origen no encontrada");

      const { data: latestVersions } = await supabase
        .from("quality_matrix_versions")
        .select("version")
        .eq("account_id", accountId)
        .order("version", { ascending: false })
        .limit(1);

      const nextVersion = (latestVersions?.[0]?.version ?? 0) + 1;

      // 2. Insertar nueva versión
      const { data: newVer, error: nvErr } = await supabase
        .from("quality_matrix_versions")
        .insert({
          account_id: accountId,
          version: nextVersion,
          label: payload.newLabel?.trim() || `${source.label || "Matriz"} (Copia)`,
          description: source.description,
          macroproceso: source.macroproceso || "ventas",
          is_active: true,
          is_default: false,
        })
        .select()
        .single();

      if (nvErr || !newVer) throw nvErr || new Error("Error al clonar versión");

      // 3. Obtener secciones origen
      const { data: srcSections } = await supabase
        .from("quality_matrix_sections")
        .select("*")
        .eq("version_id", source.id)
        .order("sort_order");

      for (const s of srcSections ?? []) {
        const { data: newSec, error: nsErr } = await supabase
          .from("quality_matrix_sections")
          .insert({
            version_id: newVer.id,
            name: s.name,
            kind: s.kind,
            sort_order: s.sort_order,
          })
          .select()
          .single();

        if (nsErr || !newSec) continue;

        const { data: srcItems } = await supabase
          .from("quality_matrix_items")
          .select("*")
          .eq("section_id", s.id)
          .order("sort_order");

        if (srcItems?.length) {
          const itemsToInsert = srcItems.map((it) => ({
            section_id: newSec.id,
            attribute: it.attribute,
            sub_attribute: it.sub_attribute,
            description: it.description,
            max_score: it.max_score,
            affectation: it.affectation,
            is_active: it.is_active,
            sort_order: it.sort_order,
          }));
          await supabase.from("quality_matrix_items").insert(itemsToInsert);
        }
      }

      return newVer;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quality-matrices-all", accountId] });
    },
  });
}

/**
 * Marca una matriz como la predeterminada de la cuenta.
 */
export function useSetDefaultMatrix(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (versionId: string) => {
      if (!accountId) throw new Error("No hay cuenta");

      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc("set_default_quality_matrix", {
          p_account_id: accountId,
          p_version_id: versionId,
        });
        if (!rpcErr) return rpcRes;
      } catch {
        // Fallback manual
      }

      await supabase
        .from("quality_matrix_versions")
        .update({ is_default: false })
        .eq("account_id", accountId);

      const { data, error } = await supabase
        .from("quality_matrix_versions")
        .update({ is_default: true, is_active: true })
        .eq("id", versionId)
        .eq("account_id", accountId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quality-matrices-all", accountId] });
      qc.invalidateQueries({ queryKey: ["quality-matrix-active", accountId] });
    },
  });
}

/**
 * Actualiza los metadatos (nombre, descripción, macroproceso) de una matriz.
 */
export function useUpdateMatrixMetadata(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      versionId: string;
      label: string;
      description?: string | null;
      macroproceso?: string | null;
    }) => {
      const { data, error } = await supabase
        .from("quality_matrix_versions")
        .update({
          label: payload.label.trim(),
          description: payload.description?.trim() || null,
          macroproceso: payload.macroproceso || "ventas",
        })
        .eq("id", payload.versionId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["quality-matrices-all", accountId] });
      qc.invalidateQueries({ queryKey: ["quality-matrix-details", vars.versionId] });
      qc.invalidateQueries({ queryKey: ["quality-matrix-active", accountId] });
    },
  });
}

/**
 * Elimina una matriz de calidad.
 */
export function useDeleteMatrix(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (versionId: string) => {
      const { error } = await supabase
        .from("quality_matrix_versions")
        .delete()
        .eq("id", versionId)
        .eq("account_id", accountId!);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quality-matrices-all", accountId] });
      qc.invalidateQueries({ queryKey: ["quality-matrix-active", accountId] });
    },
  });
}

/**
 * Sembrado inicial de matriz estándar (mantener compatibilidad).
 */
export function useSeedMatrix(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!accountId) throw new Error("No account");

      // Desactivar versiones previas
      await supabase
        .from("quality_matrix_versions")
        .update({ is_active: false, is_default: false })
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
          is_default: true,
        })
        .select()
        .single();

      if (vErr) {
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quality-matrix-active", accountId] });
      qc.invalidateQueries({ queryKey: ["quality-matrices-all", accountId] });
    },
  });
}

export function useCreateEmptyMatrix(accountId: string | undefined) {
  const create = useCreateMatrix(accountId);
  return {
    ...create,
    mutate: (vars: any, options: any) =>
      create.mutate({ name: "Matriz Manual", templateType: "blank", isDefault: true }, options),
  };
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
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["quality-matrix-active", accountId] });
      qc.invalidateQueries({ queryKey: ["quality-matrix-details", vars.version_id] });
    },
  });
}

export function useDeleteSection(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id: string; version_id?: string }) => {
      const { error } = await supabase.from("quality_matrix_sections").delete().eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["quality-matrix-active", accountId] });
      if (vars.version_id) {
        qc.invalidateQueries({ queryKey: ["quality-matrix-details", vars.version_id] });
      }
    },
  });
}

export function useUpsertItem(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<QualityMatrixItem> & { section_id: string; version_id?: string }) => {
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
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["quality-matrix-active", accountId] });
      if (vars.version_id) {
        qc.invalidateQueries({ queryKey: ["quality-matrix-details", vars.version_id] });
      }
    },
  });
}

export function useDeleteItem(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id: string; version_id?: string }) => {
      const { error } = await supabase.from("quality_matrix_items").delete().eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["quality-matrix-active", accountId] });
      if (vars.version_id) {
        qc.invalidateQueries({ queryKey: ["quality-matrix-details", vars.version_id] });
      }
    },
  });
}
