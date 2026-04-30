import { useState, useEffect } from 'react';
import { fetchProducts, fetchOrders, fetchSuppliers, createOrder, updateOrderStatus } from './api/inventory';
import Login from './components/Login';

function App() {
  // --- AUTHENTICATION STATE ---
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('lumiere_user')));

  // --- DATA STATE ---
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [activeTab, setActiveTab] = useState('inventory');
  const [showOrderModal, setShowOrderModal] = useState(false);
  
  // --- NEW: SEARCH STATE ---
  const [searchTerm, setSearchTerm] = useState('');

  // --- FORM STATE ---
  const [newOrder, setNewOrder] = useState({
    product: '',
    supplier: '',
    quantity: 0,
    warehouse: 'Warehouse A',
    orderType: 'Inbound'
  });

  // --- DATA LOADING ---
  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    try {
      const pData = await fetchProducts();
      const oData = await fetchOrders();
      const sData = await fetchSuppliers();
      setProducts(pData || []);
      setOrders(oData || []);
      setSuppliers(sData || []);
    } catch (error) {
      console.error("Critical System Sync Error:", error);
    }
  };

  // --- ACTION HANDLERS ---
  const handleLogout = () => {
    localStorage.removeItem('lumiere_user');
    setUser(null);
  };

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    if (!newOrder.product || !newOrder.supplier || newOrder.quantity <= 0) {
      alert("Please verify that product, supplier, and quantity are correct.");
      return;
    }
    await createOrder(newOrder);
    setShowOrderModal(false);
    loadData();
  };

  const handleDeliver = async (id) => {
    await updateOrderStatus(id, 'Delivered');
    loadData();
  };

  // --- NEW: FILTER LOGIC ---
  // This filters your inventory by name or SKU as you type
  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // --- ANALYTICS CALCULATIONS ---
  const totalValue = products.reduce((acc, p) => acc + (p.price * p.totalStock), 0);
  const lowStockCount = products.filter(p => p.isLowStock).length;

  // --- SECURITY GATEKEEPER ---
  if (!user) {
    return <Login setAuthUser={setUser} />;
  }

  return (
    <div className="flex min-h-screen bg-[#2C2B30] relative overflow-hidden text-gray-200 font-sans">
      
      {/* 1. BACKGROUND LAYER */}
      <div className="absolute inset-0 bg-grid pointer-events-none opacity-40"></div>
      <div className="glow-orb w-[500px] h-[500px] -top-20 -left-40 bg-[#F2C4CE]/10"></div>
      <div className="glow-orb w-[400px] h-[400px] bottom-0 -right-20 bg-[#F58F7C]/10"></div>

      {/* 2. SIDEBAR */}
      <aside className="w-64 border-r border-[#5A595E] flex flex-col bg-[#232226]/80 backdrop-blur-xl z-10">
        <div className="p-6 flex items-center gap-3 border-b border-[#5A595E]/30">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#F58F7C] to-[#F2C4CE] flex items-center justify-center">
            <span className="text-[#2C2B30] font-bold">L</span>
          </div>
          <div>
            <h1 className="font-bold text-lg text-[#F2C4CE]">Lumière</h1>
            <p className="text-[10px] text-gray-500 tracking-widest uppercase font-bold">Inventory System</p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => setActiveTab('inventory')} 
            className={`w-full text-left p-3 rounded-lg text-xs font-bold transition-all ${activeTab === 'inventory' ? 'bg-[#F2C4CE]/10 text-[#F2C4CE] border border-[#F2C4CE]/20' : 'text-gray-400 hover:bg-white/5'}`}
          >
            INVENTORY
          </button>
          <button 
            onClick={() => setActiveTab('orders')} 
            className={`w-full text-left p-3 rounded-lg text-xs font-bold transition-all ${activeTab === 'orders' ? 'bg-[#F2C4CE]/10 text-[#F2C4CE] border border-[#F2C4CE]/20' : 'text-gray-400 hover:bg-white/5'}`}
          >
            ORDER LOGS
          </button>
          <button 
            onClick={() => setActiveTab('reports')} 
            className={`w-full text-left p-3 rounded-lg text-xs font-bold transition-all ${activeTab === 'reports' ? 'bg-[#F2C4CE]/10 text-[#F2C4CE] border border-[#F2C4CE]/20' : 'text-gray-400 hover:bg-white/5'}`}
          >
            REPORTS
          </button>
        </nav>

        <div className="p-4 border-t border-[#5A595E]/30">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[9px] text-gray-500 uppercase font-bold">Current User</span>
              <span className="text-[10px] text-white font-bold truncate max-w-[120px]">{user.name}</span>
            </div>
            <button onClick={handleLogout} className="text-[9px] text-[#F58F7C] font-bold uppercase underline">Logout</button>
          </div>
        </div>
      </aside>

      {/* 3. MAIN CONTENT */}
      <main className="flex-1 flex flex-col z-10 h-screen overflow-y-auto">
        <header className="h-16 border-b border-[#5A595E] flex items-center justify-between px-8 bg-[#2C2B30]/60 backdrop-blur-md sticky top-0 z-20">
          
          {/* SEARCH BAR */}
          <div className="relative w-1/3">
            <input 
              type="text" 
              placeholder="Search by name or SKU..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#232226] border border-[#5A595E] rounded-full py-2 px-10 text-xs outline-none focus:border-[#F2C4CE] transition-all"
            />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-xs">🔍</span>
          </div>

          <div className="flex gap-4">
            <button onClick={() => setShowOrderModal(true)} className="text-[10px] bg-[#F2C4CE] text-[#2C2B30] px-4 py-2 rounded font-bold uppercase hover:brightness-110 transition">NEW ORDER</button>
            <button onClick={loadData} className="text-[10px] border border-[#5A595E] text-white px-4 py-2 rounded font-bold uppercase hover:bg-white/5">SYNC DB</button>
          </div>
        </header>

        <div className="p-8">
          {/* TAB: INVENTORY */}
          {activeTab === 'inventory' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProducts.map(p => (
                <div key={p._id} className={`p-6 rounded-xl border bg-[#36353A]/40 backdrop-blur-sm transition-all duration-500 ${p.isLowStock ? 'border-[#F2C4CE] shadow-[0_0_15px_rgba(242,196,206,0.1)]' : 'border-[#5A595E]'}`}>
                  <div className="flex justify-between mb-4">
                    <h3 className="font-bold text-white text-sm">{p.name}</h3>
                    {p.isLowStock && <span className="text-[8px] bg-[#F2C4CE] text-[#2C2B30] px-2 py-0.5 rounded font-black">LOW STOCK</span>}
                  </div>
                  <div className="space-y-2 text-[10px]">
                    <div className="flex justify-between border-b border-white/5 pb-1"><span className="text-gray-500 uppercase font-bold">SKU</span><span className="text-[#F58F7C] font-mono">{p.sku}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500 uppercase font-bold">Stock Level</span><span className={p.isLowStock ? 'text-[#F2C4CE] font-bold' : 'text-[#78DC8C]'}>{p.totalStock} units</span></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB: ORDERS */}
          {activeTab === 'orders' && (
            <div className="bg-[#36353A]/40 border border-[#5A595E] rounded-xl overflow-hidden shadow-2xl">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-[#232226] text-gray-500 uppercase border-b border-[#5A595E]">
                  <tr><th className="p-4">Product</th><th className="p-4">Type</th><th className="p-4">Quantity</th><th className="p-4">Status</th><th className="p-4 text-right">Action</th></tr>
                </thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o._id} className="border-b border-white/5 hover:bg-white/5 transition">
                      <td className="p-4 font-bold">{o.product?.name || "N/A"}</td>
                      <td className="p-4 text-gray-400">{o.orderType}</td>
                      <td className="p-4">{o.quantity}</td>
                      <td className={`p-4 font-bold ${o.status === 'Delivered' ? 'text-[#78DC8C]' : 'text-[#F58F7C]'}`}>{o.status}</td>
                      <td className="p-4 text-right">
                        {o.status !== 'Delivered' && (
                          <button onClick={() => handleDeliver(o._id)} className="text-[#F2C4CE] underline uppercase font-bold hover:text-white transition">Mark Delivered</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB: REPORTS */}
          {activeTab === 'reports' && (
            <div className="space-y-8 animate-fadeIn">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-8 bg-[#36353A]/40 border border-[#5A595E] rounded-2xl">
                  <p className="text-[10px] text-gray-500 uppercase font-bold mb-2">Total Inventory Value</p>
                  <p className="text-3xl font-bold text-[#78DC8C]">₱{totalValue.toLocaleString()}</p>
                </div>
                <div className="p-8 bg-[#36353A]/40 border border-[#F2C4CE]/20 rounded-2xl">
                  <p className="text-[10px] text-gray-500 uppercase font-bold mb-2">Critical Stock Alerts</p>
                  <p className="text-3xl font-bold text-[#F2C4CE]">{lowStockCount}</p>
                </div>
              </div>

              <div className="bg-[#36353A]/40 border border-[#5A595E] rounded-xl overflow-hidden shadow-xl">
                <div className="p-4 border-b border-[#5A595E] bg-[#232226]/50">
                   <h3 className="text-xs font-bold text-white uppercase tracking-widest">Warehouse Distribution Table</h3>
                </div>
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="text-gray-500 border-b border-[#5A595E] uppercase font-bold">
                      <th className="p-4">Product Name</th>
                      <th className="p-4 text-center">Warehouse A</th>
                      <th className="p-4 text-center">Warehouse B</th>
                      <th className="p-4 text-center">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map(p => (
                      <tr key={p._id} className="border-b border-white/5 hover:bg-white/5 transition">
                        <td className="p-4 font-bold">{p.name}</td>
                        <td className="p-4 text-center text-gray-400">{p.warehouses.find(w => w.name === 'Warehouse A')?.stock || 0}</td>
                        <td className="p-4 text-center text-gray-400">{p.warehouses.find(w => w.name === 'Warehouse B')?.stock || 0}</td>
                        <td className={`p-4 text-center font-bold ${p.isLowStock ? 'text-[#F2C4CE]' : 'text-white'}`}>{p.totalStock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 4. NEW ORDER MODAL */}
      {showOrderModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <form onSubmit={handleCreateOrder} className="bg-[#36353A] border border-[#5A595E] p-8 rounded-2xl w-full max-w-md space-y-5 shadow-2xl">
            <h3 className="text-sm font-bold text-[#F2C4CE] uppercase tracking-widest border-b border-white/10 pb-4">Create New Transfer</h3>
            
            <div className="space-y-1">
              <label className="text-[10px] text-gray-500 uppercase font-bold">Order Type</label>
              <select 
                className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs text-white" 
                onChange={(e) => setNewOrder({...newOrder, orderType: e.target.value})}
                value={newOrder.orderType}
              >
                <option value="Inbound">Restock (Supplier to Warehouse)</option>
                <option value="Outbound">Sale (Warehouse to Customer)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-gray-500 uppercase font-bold">Product</label>
              <select className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs text-white" onChange={(e) => setNewOrder({...newOrder, product: e.target.value})} required>
                <option value="">-- Select Product --</option>
                {products.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-gray-500 uppercase font-bold">Supplier</label>
              <select className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs text-white" onChange={(e) => setNewOrder({...newOrder, supplier: e.target.value})} required>
                <option value="">-- Select Supplier --</option>
                {suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] text-gray-500 uppercase font-bold">Quantity</label>
                <input type="number" className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs" onChange={(e) => setNewOrder({...newOrder, quantity: parseInt(e.target.value)})} required />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-gray-500 uppercase font-bold">Warehouse</label>
                <select className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs" onChange={(e) => setNewOrder({...newOrder, warehouse: e.target.value})}>
                  <option value="Warehouse A">Warehouse A</option>
                  <option value="Warehouse B">Warehouse B</option>
                </select>
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <button type="submit" className="flex-1 bg-[#F2C4CE] text-[#2C2B30] font-bold py-3 rounded text-xs uppercase hover:brightness-110 transition">Confirm Order</button>
              <button type="button" onClick={() => setShowOrderModal(false)} className="flex-1 border border-[#5A595E] text-gray-400 font-bold py-3 rounded text-xs uppercase hover:bg-white/5 transition">Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;