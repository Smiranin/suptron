import { PageContainer, PageHeader } from '../../components/page';
import { ExportSection } from './ExportSection';
import { ImportSection } from './ImportSection';

/** Moves Units and Projects to another machine or person as an Export file, and brings one in. */
export function ExportImportPage() {
  return (
    <PageContainer>
      <PageHeader title="Export & Import" />
      <div className="flex flex-col gap-12">
        <ExportSection />
        <ImportSection />
      </div>
    </PageContainer>
  );
}
