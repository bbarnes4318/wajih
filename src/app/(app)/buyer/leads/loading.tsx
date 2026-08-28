import { Skeleton } from "@/components/ui/skeleton";
import { Panel, PanelBody } from "@/components/ui/card";

export default function Loading() {
  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface/85 px-3 backdrop-blur-md sm:px-5 xl:px-6">
        <Skeleton className="h-4 w-36" />
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-7 w-24 rounded-md" />
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <Panel className="m-4">
            <PanelBody dense>
              <div className="space-y-px p-4">
                {Array.from({ length: 8 }, (_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            </PanelBody>
          </Panel>
        </div>
      </div>
    </>
  );
}
