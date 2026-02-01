import { getHomepageContent } from "@/lib/homepage/getHomepageContent";
import HomepageEditor from "./HomepageEditor";

export default async function HomepageEditorPage() {
  let homepageContent;
  let error: string | null = null;

  try {
    homepageContent = await getHomepageContent("draft");
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to load homepage content";
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-gray-900 mb-2">Homepage Editor</h1>
          <p className="text-gray-600">Edit draft homepage content. Changes are validated before saving.</p>
        </div>

        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error}</p>
          </div>
        ) : homepageContent ? (
          <HomepageEditor initialContent={homepageContent} />
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-800">No draft content found. Create one to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
