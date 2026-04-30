import { useState, useEffect } from 'react';
import { fetchProducts, fetchOrders, fetchSuppliers, createOrder, updateOrderStatus } from './api/inventory';

function App() {
  // --- STATE MANAGEMENT ---
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [activeTab, setActiveTab] = useState('inventory');
  const [showOrderModal, setShowOrderModal] = useState(false);

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
    loadData();
  }, []);

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
  const handleCreateOrder = async (e) => {
    e.preventDefault();
    if (!newOrder.product || !newOrder.supplier || newOrder.quantity <= 0) {
      alert("INCOMPLETE_DATA: Please verify product, supplier, and quantity.");
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

  // --- ANALYTICS CALCULATIONS[cite: 2] ---
  const totalValue = products.reduce((acc, p) => acc + (p.price * p.totalStock), 0);
  const lowStockCount = products.filter(p => p.isLowStock).length;

  return (
    <div className="flex min-h-screen bg-[#2C2B30] relative overflow-hidden text-gray-200 font-mono">
      
      {/* 1. BACKGROUND LAYER[cite: 1] */}
      <div className="absolute inset-0 bg-grid pointer-events-none opacity-40"></div>
      <div className="glow-orb w-[500px] h-[500px] -top-20 -left-40 bg-[#F2C4CE]/10"></div>
      <div className="glow-orb w-[400px] h-[400px] bottom-0 -right-20 bg-[#F58F7C]/10"></div>

      {/* 2. SIDEBAR[cite: 1, 2] */}
      <aside className="w-64 border-r border-[#5A595E] flex flex-col bg-[#232226]/80 backdrop-blur-xl z-10">
        <div className="p-6 flex items-center gap-3 border-b border-[#5A595E]/30">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#F58F7C] to-[#F2C4CE] flex items-center justify-center">
            <span className="text-[#2C2B30] font-bold">L</span>
          </div>
          <div>
            <h1 className="font-bold text-lg neon-glow-pink text-[#F2C4CE]">Lumière</h1>
            <p className="text-[10px] text-gray-500 tracking-widest uppercase">Inventory_Node</p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <div className="text-[10px] uppercase text-gray-600 font-bold mb-4 ml-2">Main_Console</div>
          <button 
            onClick={() => setActiveTab('inventory')} 
            className={`w-full text-left p-3 rounded-lg text-xs transition-all ${activeTab === 'inventory' ? 'bg-[#F2C4CE]/10 text-[#F2C4CE] border border-[#F2C4CE]/20' : 'text-gray-400 hover:bg-white/5'}`}
          >
            INVENTORY_GRID
          </button>
          <button 
            onClick={() => setActiveTab('orders')} 
            className={`w-full text-left p-3 rounded-lg text-xs transition-all ${activeTab === 'orders' ? 'bg-[#F2C4CE]/10 text-[#F2C4CE] border border-[#F2C4CE]/20' : 'text-gray-400 hover:bg-white/5'}`}
          >
            ORDER_LOGS
          </button>
          <button 
            onClick={() => setActiveTab('reports')} 
            className={`w-full text-left p-3 rounded-lg text-xs transition-all ${activeTab === 'reports' ? 'bg-[#F2C4CE]/10 text-[#F2C4CE] border border-[#F2C4CE]/20' : 'text-gray-400 hover:bg-white/5'}`}
          >
            ANALYTICS_REPORT
          </button>
        </nav>
      </aside>

      {/* 3. MAIN CONTENT[cite: 1, 2] */}
      <main className="flex-1 flex flex-col z-10 h-screen overflow-y-auto">
        <header className="h-16 border-b border-[#5A595E] flex items-center justify-between px-8 bg-[#2C2B30]/60 backdrop-blur-md">
          <h2 className="text-xs font-bold uppercase tracking-widest">{activeTab.replace('_', ' ')}</h2>
          <div className="flex gap-4">
            <button 
              onClick={() => setShowOrderModal(true)} 
              className="text-[10px] border border-[#F2C4CE] text-[#F2C4CE] px-4 py-2 rounded uppercase font-bold hover:bg-[#F2C4CE]/10 transition"
            >
              NEW_ORDER
            </button>
            <button 
              onClick={loadData} 
              className="text-[10px] bg-[#F58F7C] text-[#2C2B30] px-4 py-2 rounded uppercase font-bold hover:brightness-110"
            >
              SYNC_DB
            </button>
          </div>
        </header>

        <div className="p-8">
          {/* TAB: INVENTORY[cite: 1, 2] */}
          {activeTab === 'inventory' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map(p => (
                <div key={p._id} className={`p-6 rounded-xl border bg-[#36353A]/40 backdrop-blur-sm transition-all duration-500 ${p.isLowStock ? 'neon-border-pink' : 'border-[#5A595E]'}`}>
                  <div className="flex justify-between mb-4">
                    <h3 className="font-bold text-white text-sm">{p.name}</h3>
                    {p.isLowStock && <span className="text-[8px] bg-[#F2C4CE] text-[#2C2B30] px-2 py-0.5 rounded font-black">ALERT</span>}
                  </div>
                  <div className="space-y-2 text-[10px]">
                    <div className="flex justify-between border-b border-white/5 pb-1"><span className="text-gray-500">SKU</span><span className="text-[#F58F7C]">{p.sku}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">STOCK_LEVEL</span><span className={p.isLowStock ? 'text-[#F2C4CE] neon-glow-pink font-bold' : 'text-[#78DC8C]'}>{p.totalStock} PCS</span></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB: ORDERS[cite: 2] */}
          {activeTab === 'orders' && (
            <div className="bg-[#36353A]/40 border border-[#5A595E] rounded-xl overflow-hidden">
              <table className="w-full text-left text-[10px]">
                <thead className="bg-[#232226] text-gray-500 uppercase border-b border-[#5A595E]">
                  <tr>
                    <th className="p-4">ITEM</th>
                    <th className="p-4">TYPE</th>
                    <th className="p-4">QUANTITY</th>
                    <th className="p-4">STATUS</th>
                    <th className="p-4 text-right">ACTION</th>
                  </tr>
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
                          <button onClick={() => handleDeliver(o._id)} className="text-[#F2C4CE] underline uppercase font-bold hover:text-white transition">MARK_DELIVERED</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB: REPORTS[cite: 2] */}
          {activeTab === 'reports' && (
            <div className="space-y-8 animate-fadeIn">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 bg-[#36353A]/40 border border-[#5A595E] rounded-xl">
                  <p className="text-[10px] text-gray-500 uppercase mb-2">Est_Inventory_Value</p>
                  <p className="text-3xl font-bold text-[#78DC8C]">₱{totalValue.toLocaleString()}</p>
                </div>
                <div className="p-6 bg-[#36353A]/40 border border-[#F2C4CE]/30 rounded-xl">
                  <p className="text-[10px] text-gray-500 uppercase mb-2">Critical_Nodes</p>
                  <p className="text-3xl font-bold text-[#F2C4CE] neon-glow-pink">{lowStockCount}</p>
                </div>
              </div>

              <div className="bg-[#36353A]/40 border border-[#5A595E] rounded-xl overflow-hidden">
                <div className="p-4 border-b border-[#5A595E] bg-[#232226]/50">
                   <h3 className="text-[10px] font-bold text-white uppercase tracking-widest">Warehouse_Distribution_Table</h3>
                </div>
                <table className="w-full text-left text-[10px]">
                  <thead>
                    <tr className="text-gray-500 border-b border-[#5A595E] uppercase">
                      <th className="p-4">PRODUCT</th>
                      <th className="p-4 text-center">WH_A</th>
                      <th className="p-4 text-center">WH_B</th>
                      <th className="p-4 text-center">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map(p => (
                      <tr key={p._id} className="border-b border-white/5 hover:bg-white/5">
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

      {/* 4. NEW ORDER MODAL[cite: 2] */}
      {showOrderModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <form onSubmit={handleCreateOrder} className="bg-[#36353A] border border-[#5A595E] p-8 rounded-2xl w-full max-w-md space-y-4">
            <h3 className="text-sm font-bold text-[#F2C4CE] uppercase tracking-widest border-b border-white/10 pb-4">Initialize_New_Transfer</h3>
            
            <div className="space-y-1">
              <label className="text-[9px] text-gray-500 uppercase">Transfer_Direction</label>
              <select 
                className="w-full bg-[#2C2B30] border border-[#5A595E] p-2 rounded text-xs text-[#F2C4CE] font-bold" 
                onChange={(e) => setNewOrder({...newOrder, orderType: e.target.value})}
                value={newOrder.orderType}
              >
                <option value="Inbound">INBOUND (Supplier to Warehouse)</option>
                <option value="Outbound">OUTBOUND (Warehouse to Client)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] text-gray-500 uppercase">Target_Sign</label>
              <select className="w-full bg-[#2C2B30] border border-[#5A595E] p-2 rounded text-xs text-white" onChange={(e) => setNewOrder({...newOrder, product: e.target.value})} required>
                <option value="">Select Sign</option>
                {products.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] text-gray-500 uppercase">Node_Partner</label>
              <select className="w-full bg-[#2C2B30] border border-[#5A595E] p-2 rounded text-xs text-white" onChange={(e) => setNewOrder({...newOrder, supplier: e.target.value})} required>
                <option value="">Select Supplier</option>
                {suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[9px] text-gray-500 uppercase">Units</label>
                <input type="number" className="w-full bg-[#2C2B30] border border-[#5A595E] p-2 rounded text-xs" onChange={(e) => setNewOrder({...newOrder, quantity: parseInt(e.target.value)})} required />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] text-gray-500 uppercase">Warehouse_Hub</label>
                <select className="w-full bg-[#2C2B30] border border-[#5A595E] p-2 rounded text-xs" onChange={(e) => setNewOrder({...newOrder, warehouse: e.target.value})}>
                  <option value="Warehouse A">Warehouse A</option>
                  <option value="Warehouse B">Warehouse B</option>
                </select>
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <button type="submit" className="flex-1 bg-[#F2C4CE] text-[#2C2B30] font-black py-3 rounded text-[10px] uppercase shadow-[0_0_15px_rgba(242,196,206,0.3)]">Authorize_Order</button>
              <button type="button" onClick={() => setShowOrderModal(false)} className="flex-1 border border-[#5A595E] text-gray-400 font-bold py-3 rounded text-[10px] uppercase">Abort_Command</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;