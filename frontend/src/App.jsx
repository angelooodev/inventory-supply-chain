import { useState, useEffect } from 'react';
import { fetchProducts } from './api/inventory';

function App() {
  const [products, setProducts] = useState([]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const data = await fetchProducts();
    setProducts(data);
  };

  return (
    <div className="flex min-h-screen bg-[#2C2B30] relative overflow-hidden">
      
      {/* BACKGROUND LAYER */}
      <div className="absolute inset-0 bg-grid pointer-events-none opacity-50"></div>
      <div className="glow-orb w-[500px] h-[500px] -top-20 -left-40 bg-[#F2C4CE]/10"></div>
      <div className="glow-orb w-[400px] h-[400px] bottom-0 -right-20 bg-[#F58F7C]/10"></div>

      {/* SIDEBAR */}
      <aside className="w-64 border-r border-[#5A595E] flex flex-col bg-[#232226]/80 backdrop-blur-xl z-10">
        <div className="p-6 flex items-center gap-3 border-b border-[#5A595E]/30">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#F58F7C] to-[#F2C4CE] flex items-center justify-center">
            <span className="text-[#2C2B30] font-bold">L</span>
          </div>
          <div>
            <h1 className="font-bold text-lg neon-glow-pink text-[#F2C4CE]">Lumière</h1>
            <p className="text-[10px] text-gray-500 tracking-widest">INVENTORY_NODE</p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <div className="text-[10px] uppercase text-gray-500 font-bold mb-4 ml-2">Main Console</div>
          <button className="w-full text-left p-3 rounded-lg bg-[#F2C4CE]/10 text-[#F2C4CE] text-sm flex items-center gap-3 border border-[#F2C4CE]/20">
            <span>Dashboard</span>
          </button>
          <button className="w-full text-left p-3 rounded-lg hover:bg-white/5 text-gray-400 text-sm flex items-center gap-3 transition">
            <span>Inventory</span>
          </button>
        </nav>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col z-10">
        <header className="h-16 border-b border-[#5A595E] flex items-center justify-between px-8 bg-[#2C2B30]/60 backdrop-blur-md">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-tighter">System Overview</h2>
            <p className="text-[10px] text-gray-400">Node: Warehouse_A // Sector: Cebu</p>
          </div>
          <button onClick={loadData} className="text-xs bg-[#F58F7C] text-[#2C2B30] font-bold px-4 py-2 rounded-md hover:scale-105 transition-transform">
            SYNC_DATABASE
          </button>
        </header>

        <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map(product => (
            <div 
              key={product._id} 
              /* REMOVED animate-pulse HERE */
              className={`p-6 rounded-xl border bg-[#36353A]/40 backdrop-blur-sm transition-all duration-500 ${
                product.isLowStock ? 'neon-border-pink' : 'border-[#5A595E] hover:border-[#F2C4CE]/40'
              }`}
            >
              <div className="flex justify-between items-start mb-4">
                <h3 className="font-bold text-white text-sm tracking-tight">{product.name}</h3>
                {product.isLowStock && (
                  <span className="text-[8px] bg-[#F2C4CE] text-[#2C2B30] px-2 py-0.5 rounded-full font-black">ALERT</span>
                )}
              </div>
              
              <div className="space-y-3 text-xs">
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-gray-500">SERIAL_NO</span>
                  <span className="text-[#F58F7C] font-mono">{product.sku}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">AVAILABILITY</span>
                  {/* Keep the text glow, but it's now static */}
                  <span className={product.isLowStock ? 'text-[#F2C4CE] neon-glow-pink' : 'text-[#78DC8C]'}>
                    {product.totalStock} PCS
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default App;