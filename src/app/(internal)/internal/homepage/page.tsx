import FeaturedPlantsManager from "./FeaturedPlantsManager";

export default async function HomepageEditorPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-gray-900 mb-2">Featured Plants Manager</h1>
          <p className="text-gray-600">Select plants to feature on the homepage carousel.</p>
        </div>

        <FeaturedPlantsManager />
      </div>
    </div>
  );
}
