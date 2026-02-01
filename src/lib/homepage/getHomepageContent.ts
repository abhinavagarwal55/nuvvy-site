import { createServerSupabaseClient } from "@/lib/supabase/ssr";
import { HomepageSchema, type HomepageContent } from "@/lib/schemas/homepage.schema";

/**
 * Fetch homepage content from Supabase and validate against Zod schema.
 * @param status - 'draft' or 'published'
 * @returns Validated homepage content
 * @throws Error if content is missing or invalid
 */
export async function getHomepageContent(
  status: "draft" | "published"
): Promise<HomepageContent> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("homepage_content")
    .select("content")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch homepage content: ${error.message}`);
  }

  if (!data || !data.content) {
    throw new Error(`No homepage content found with status: ${status}`);
  }

  const parseResult = HomepageSchema.safeParse(data.content);

  if (!parseResult.success) {
    throw new Error(
      `Invalid homepage content schema: ${parseResult.error.message}`
    );
  }

  return parseResult.data;
}
