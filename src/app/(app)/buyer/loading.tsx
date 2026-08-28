import { Skeleton } from "@/components/ui/skeleton";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/card";

/**
 * Mirrors BuyerOverviewPage's real grid — same tile count, same panel count,
 * same row heights — so nothing shifts once the data streams in.
 */
export default function Loading() {
  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface/85 px-3 backdrop-blur-md sm:px-5 xl:px-6">
        <Skeleton className="h-4 w-28" />
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 xl:p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-[104px]" />
          <Skeleton className="h-[104px]" />
          <Skeleton className="h-[104px]" />
          <Skeleton className="h-[104px]" />
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Panel className="xl:col-span-2">
            <PanelHeader title={<Skeleton className="h-4 w-56" />} />
            <PanelBody dense>
              <div className="space-y-px p-4">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-11 w-full" />
                ))}
              </div>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title={<Skeleton className="h-4 w-32" />} />
            <PanelBody>
              <div className="space-y-2">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            </PanelBody>
          </Panel>
        </div>

        <Panel>
          <PanelHeader title={<Skeleton className="h-4 w-44" />} />
          <PanelBody dense>
            <div className="space-y-px p-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}
