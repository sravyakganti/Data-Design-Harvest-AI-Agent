client/src/pages/home.tsx 
import UrlInput from "@/components/scraping/url-input";
import RecentResults from "@/components/scraping/recent-results";
import DataVisualization from "@/components/data/visualization";
import ExportSection from "@/components/data/export-section";

export default function Home() {
  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <UrlInput />
      <RecentResults />
      <DataVisualization />
      <ExportSection />
    </div>
  );
}
