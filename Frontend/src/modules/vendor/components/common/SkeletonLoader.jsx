export default function SkeletonLoader({ type = 'card', count = 1 }) {
  const renderSkeleton = (key) => {
    switch (type) {
      case 'dashboard':
        return (
          <div key={key} className="space-y-6 w-full animate-pulse">
            <div className="flex flex-col md:flex-row justify-between gap-4">
              <div className="space-y-3">
                <div className="h-8 w-48 bg-surface-container-high rounded-lg"></div>
                <div className="h-4 w-64 bg-surface-container-high rounded-md"></div>
              </div>
              <div className="flex gap-3">
                <div className="h-10 w-28 bg-surface-container-high rounded-lg"></div>
                <div className="h-10 w-28 bg-surface-container-high rounded-lg"></div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-28 bg-surface-container-high rounded-xl border border-outline-variant/10"></div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <div className="h-6 w-40 bg-surface-container-high rounded-md mb-4"></div>
                {[1, 2].map(i => (
                  <div key={i} className="h-24 bg-surface-container-high rounded-xl"></div>
                ))}
              </div>
              <div className="space-y-4">
                <div className="h-6 w-32 bg-surface-container-high rounded-md mb-4"></div>
                <div className="h-64 bg-surface-container-high rounded-2xl"></div>
              </div>
            </div>
          </div>
        );
      case 'list':
        return (
          <div key={key} className="flex items-center gap-4 p-4 animate-pulse border-b border-outline-variant/10">
            <div className="w-12 h-12 rounded-full bg-surface-container-high flex-shrink-0"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 bg-surface-container-high rounded"></div>
              <div className="h-3 w-1/2 bg-surface-container-high rounded"></div>
            </div>
            <div className="w-16 h-6 rounded bg-surface-container-high flex-shrink-0"></div>
          </div>
        );
      case 'profile':
        return (
          <div key={key} className="space-y-6 w-full animate-pulse">
            <div className="h-8 w-48 bg-surface-container-high rounded-lg"></div>
            <div className="bg-white rounded-[2rem] border border-outline-variant/20 overflow-hidden">
              <div className="h-32 md:h-48 bg-surface-container-high"></div>
              <div className="px-6 pb-8 md:px-10 relative">
                <div className="w-24 h-24 md:w-32 md:h-32 bg-surface-container-highest rounded-2xl border-4 border-white -mt-12 md:-mt-16 mb-6"></div>
                <div className="space-y-4">
                  <div className="h-6 w-1/2 bg-surface-container-high rounded"></div>
                  <div className="h-4 w-1/3 bg-surface-container-high rounded"></div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 mt-8">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="h-12 bg-surface-container-high rounded-xl"></div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      case 'card':
      default:
        return (
          <div key={key} className="p-4 rounded-xl border border-outline-variant/20 bg-white/50 animate-pulse space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-surface-container-high"></div>
              <div className="flex-1 space-y-2">
                <div className="h-3 w-2/3 bg-surface-container-high rounded"></div>
                <div className="h-2 w-1/3 bg-surface-container-high rounded"></div>
              </div>
            </div>
            <div className="h-16 bg-surface-container-high rounded-lg w-full"></div>
          </div>
        );
    }
  };

  return (
    <>
      {Array.from({ length: count }).map((_, idx) => renderSkeleton(idx))}
    </>
  );
}
