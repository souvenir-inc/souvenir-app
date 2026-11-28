"use client";

import { MODELS_ALL_ENDPOINT, MODELS_BLOCK_ENDPOINT } from "@/lib/config";
import { apiFetch, apiFetchJson, ApiError } from "./client";
import { trackBrowserEvent } from "@/lib/analytics/events";
import { blockResultSchema, modelWithStatusSchema, parseModelList } from "./model-schemas";

// ── Schemas (match OpenAPI components.schemas) ────────────────────────────────

export interface GetModels {
  model_id:              string;
  model_name:            string;
  model_provider:        string;
  model_inputs:          string[];
  model_outputs:         string[];
  model_context_window?: number | null;
  model_output_size?:    number | null;
  model_input_cost?:     number | null;
  model_output_cost?:    number | null;
  model_plan_type:          string;
  model_description:        string;
  model_thinking_efforts?:  string[];
  model_tags?:              string[];
}

export interface GetModelsWithStatus extends GetModels {
  blocked: boolean;
}

export interface BlockModelRequest {
  model_id: string;
}

// Kept for back-compat with existing callers
export type LLMModel = GetModelsWithStatus;

// ── API functions ─────────────────────────────────────────────────────────────

/** GET /llm/models/all — every model with its blocked flag for this user.
 *  Throws ApiError (or a parse error) so a screen can tell "failed" from
 *  "no models". Malformed rows are dropped individually. */
export async function loadAllModels(): Promise<GetModelsWithStatus[]> {
  const raw = await apiFetchJson<unknown>(MODELS_ALL_ENDPOINT, { method: "GET" });
  return parseModelList(modelWithStatusSchema, raw).models;
}

/** As loadAllModels, but never throws: [] on any failure. For callers that
 *  treat the catalogue as optional (agent health, pickers). */
export async function fetchAllModels(): Promise<GetModelsWithStatus[]> {
  try {
    return await loadAllModels();
  } catch {
    return [];
  }
}

/** PATCH /llm/models/block — toggle blocked status for a model. */
export async function toggleBlockModel(model_id: string): Promise<{ blocked: boolean }> {
  const res = await apiFetch(MODELS_BLOCK_ENDPOINT, {
    method: "PATCH",
    body:   JSON.stringify({ model_id } satisfies BlockModelRequest),
  });
  if (!res.ok) throw new ApiError(res.status, "block_model_failed", "Failed to update model status");
  const result = blockResultSchema.parse(await res.json());
  if (result.blocked) trackBrowserEvent("model_toggled_off", { model_id });
  else trackBrowserEvent("model_toggled_on", { model_id });
  return result;
}
