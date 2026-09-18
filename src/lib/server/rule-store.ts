import type { User } from "@supabase/supabase-js";

import type {
  ExtractedRule,
  RuleAssetData,
  RulePriority,
  RuleSourceType,
  RuleStatus,
  RuleType,
} from "../../data/rule-assets.ts";
import { getSupabaseServerClient } from "../supabase/server.ts";

type CloudAssetRow = {
  id: string;
  title: string;
  source_type: RuleSourceType;
  content: string;
  category: string;
  created_at: string;
  updated_at: string;
};

type CloudRuleRow = {
  id: string;
  asset_id: string;
  type: RuleType;
  priority: RulePriority;
  statement: string;
  rationale: string;
  source_excerpt: string;
  status: RuleStatus;
};

export async function getCloudRuleUser(): Promise<User | null> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function listCloudRuleAssets(user: User) {
  const supabase = await getSupabaseServerClient();
  const { data: assetRows, error: assetError } = await supabase
    .from("rule_assets")
    .select(
      "id, title, source_type, content, category, created_at, updated_at",
    )
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (assetError) {
    throw assetError;
  }

  const { data: ruleRows, error: ruleError } = await supabase
    .from("rules")
    .select(
      "id, asset_id, type, priority, statement, rationale, source_excerpt, status",
    )
    .eq("user_id", user.id);

  if (ruleError) {
    throw ruleError;
  }

  const rules = ruleRows as CloudRuleRow[];

  return (assetRows as CloudAssetRow[]).map<RuleAssetData>((asset) => ({
    id: asset.id,
    title: asset.title,
    sourceType: asset.source_type,
    content: asset.content,
    category: asset.category,
    createdAt: asset.created_at,
    updatedAt: asset.updated_at,
    rules: rules
      .filter((rule) => rule.asset_id === asset.id)
      .map<ExtractedRule>((rule) => ({
        id: rule.id,
        type: rule.type,
        priority: rule.priority,
        statement: rule.statement,
        rationale: rule.rationale,
        sourceExcerpt: rule.source_excerpt,
        status: rule.status,
      })),
  }));
}

export async function saveCloudRuleAsset(
  user: User,
  asset: RuleAssetData,
) {
  const supabase = await getSupabaseServerClient();
  const { error: assetError } = await supabase
    .from("rule_assets")
    .upsert({
      user_id: user.id,
      id: asset.id,
      title: asset.title,
      source_type: asset.sourceType,
      content: asset.content,
      category: asset.category,
      created_at: asset.createdAt,
      updated_at: asset.updatedAt,
    });

  if (assetError) {
    throw assetError;
  }

  const { error: deleteError } = await supabase
    .from("rules")
    .delete()
    .eq("user_id", user.id)
    .eq("asset_id", asset.id);

  if (deleteError) {
    throw deleteError;
  }

  if (asset.rules.length > 0) {
    const { error: ruleError } = await supabase.from("rules").insert(
      asset.rules.map((rule) => ({
        user_id: user.id,
        id: rule.id,
        asset_id: asset.id,
        type: rule.type,
        priority: rule.priority,
        statement: rule.statement,
        rationale: rule.rationale,
        source_excerpt: rule.sourceExcerpt,
        status: rule.status,
      })),
    );

    if (ruleError) {
      throw ruleError;
    }
  }
}

export async function deleteCloudRuleAsset(
  user: User,
  assetId: string,
) {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("rule_assets")
    .delete()
    .eq("user_id", user.id)
    .eq("id", assetId);

  if (error) {
    throw error;
  }
}
