export default function PhotosTab() {
  const media = [
    { id: 1, type: "image", url: "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&w=400&q=80" },
    { id: 2, type: "image", url: "https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?auto=format&fit=crop&w=400&q=80" },
    { id: 3, type: "video", url: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&w=400&q=80" },
    { id: 4, type: "image", url: "https://images.unsplash.com/photo-1581044777550-4cfa60707c03?auto=format&fit=crop&w=400&q=80" },
    { id: 5, type: "image", url: "https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?auto=format&fit=crop&w=400&q=80" },
    { id: 6, type: "video", url: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=400&q=80" },
  ];

  return (
    <div className="animate-reveal">
      <div className="grid grid-cols-2 gap-2">
        {media.map(item => (
          <div key={item.id} className="relative aspect-square rounded-2xl overflow-hidden bg-surface-container">
            <img src={item.url} alt="Store media" className="w-full h-full object-cover" />
            
            {item.type === 'video' && (
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                <div className="w-10 h-10 rounded-full bg-white/30 backdrop-blur-md flex items-center justify-center">
                  <span className="material-symbols-outlined text-white" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
