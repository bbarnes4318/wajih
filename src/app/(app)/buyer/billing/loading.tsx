import { Skeleton } from "@/components/ui/skeleton";
import { Panel, PanelBody } from "@/components/ui/card";

export default function Loading() {
  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface/85 px-3 backdrop-blur-md sm:px-5 xl:px-6">
        <Skeleton className="h-4 w-24" />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5 xl:p-6">
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Panel>
            <PanelBody dense>
              <div className="space-y-px p-4">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            </PanelBody>
          </Panel>
          <Panel>
            <PanelBody dense>
              <div className="space-y-px p-4">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            </PanelBody>
          </Panel>
        </div>

        <Panel className="mt-3">
          <PanelBody dense>
            <div className="space-y-px p-4">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}
