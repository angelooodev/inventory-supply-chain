import { useState, useEffect } from 'react';
import { fetchProducts, fetchOrders, fetchSuppliers, createOrder, updateOrderStatus } from './api/inventory';
import Login from './components/Login';
import { Menu, X, Download, ShieldCheck, Users, Package, Truck, LayoutDashboard } from 'lucide-react';

// --- SVG COMPONENTS ---
const SearchIcon = () => (
  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const BellIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  </svg>
);

function App() {
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('lumiere_user')));
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [users, setUsers] = useState([]); 
  const [activeTab, setActiveTab] = useState('inventory');
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [successMessage, setSuccessMessage] = useState(''); 
  const [showNotifications, setShowNotifications] = useState(false);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); 
  const [selectedCategory, setSelectedCategory] = useState('All');

  const [newOrder, setNewOrder] = useState({
    product: '', supplier: '', quantity: 0, warehouse: 'Warehouse A', orderType: 'Inbound'
  });

  const [newStaff, setNewStaff] = useState({
    name: '', email: '', password: '', role: 'Staff'
  });

  useEffect(() => {
    if (user) {
      loadData();
      if (user.role === 'Manager') fetchUsers();
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

  const fetchUsers = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/users', {
        headers: { 'Authorization': `Bearer ${user.token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error("Directory sync failed:", error);
    }
  };

  const triggerSuccess = (msg) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const exportToCSV = () => {
    const headers = "Product,SKU,Price,Stock,TotalValue\n";
    const csvRows = products.map(p => 
      `${p.name},${p.sku},${p.price},${p.totalStock},${p.price * p.totalStock}`
    ).join("\n");
    const blob = new Blob([headers + csvRows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', `lumiere_analytics_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    triggerSuccess("Analytics Report Exported");
  };

  const getUnitColor = (count, isLow) => {
    if (count <= 0) return 'text-red-500';
    if (isLow) return 'text-[#F2C4CE]';
    return 'text-[#78DC8C]';
  };

  const getCardStyle = (count, isLow) => {
    if (count <= 0) return 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)]';
    if (isLow) return 'border-[#F2C4CE] shadow-[0_0_15px_rgba(242,196,206,0.15)]';
    return 'border-[#FFB7C5] shadow-[0_0_10px_rgba(255,183,197,0.05)]';
  };

  const handleLogout = () => {
    localStorage.removeItem('lumiere_user');
    setUser(null);
  };

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    await createOrder(newOrder);
    setShowOrderModal(false);
    setShowNotifications(false); 
    triggerSuccess(`Successful: ${newOrder.orderType} transfer initiated.`);
    loadData();
  };

  const handleDeliver = async (id, type) => {
    await updateOrderStatus(id, 'Delivered');
    triggerSuccess(`System Update: ${type} transfer confirmed.`);
    loadData(); 
  };

  const handleRegisterStaff = async (e) => {
    e.preventDefault();
    const response = await fetch('http://localhost:5000/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
      body: JSON.stringify(newStaff),
    });
    if (response.ok) {
      triggerSuccess(`New Node Authorized: ${newStaff.name}`);
      setNewStaff({ name: '', email: '', password: '', role: 'Staff' });
      fetchUsers();
    }
  };

  const handleDeactivateUser = async (id) => {
    if (window.confirm("Revoke access for this user?")) {
      const response = await fetch(`http://localhost:5000/api/users/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${user.token}` }
      });
      if (response.ok) {
        triggerSuccess("User deactivated.");
        fetchUsers();
      }
    }
  };

  const categories = ['All', ...new Set(products.map(p => p.category))];
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const lowStockAlerts = products.filter(p => p.isLowStock);
  const pendingOutbound = orders.filter(o => o.orderType === 'Outbound' && o.status !== 'Delivered');
  const totalValue = products.reduce((acc, p) => acc + (p.price * p.totalStock), 0);
  const lowStockCount = products.filter(p => p.isLowStock).length;

  if (!user) return <Login setAuthUser={setUser} />;

  return (
    <div className="flex min-h-screen bg-[#2C2B30] relative overflow-hidden text-gray-200 font-mono">
      
      {successMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] bg-green-500 text-white px-8 py-3 rounded-full shadow-2xl font-bold text-[10px] uppercase tracking-widest animate-bounce">
          {successMessage}
        </div>
      )}

      <div className="absolute inset-0 bg-grid pointer-events-none opacity-40"></div>
      <div className="glow-orb w-[500px] h-[500px] -top-20 -left-40 bg-[#F2C4CE]/10"></div>
      <div className="glow-orb w-[400px] h-[400px] bottom-0 -right-20 bg-[#F58F7C]/10"></div>

      <aside className={`fixed md:relative z-50 w-64 border-r border-[#5A595E] flex flex-col bg-[#232226] transform transition-transform duration-300 h-screen sticky top-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-6 flex items-center justify-between border-b border-[#5A595E]/30">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#F2C4CE] flex items-center justify-center font-bold text-[#2C2B30]">L</div>
            <h1 className="font-bold text-lg text-[#F2C4CE]">Lumière</h1>
          </div>
          <button className="md:hidden" onClick={() => setIsSidebarOpen(false)}><X size={20} /></button>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <button onClick={() => {setActiveTab('inventory'); setIsSidebarOpen(false)}} className={`w-full text-left p-3 rounded-lg text-xs font-bold transition-all ${activeTab === 'inventory' ? 'bg-[#F2C4CE]/10 text-[#F2C4CE] border border-[#F2C4CE]/20' : 'text-gray-400 hover:bg-white/5'}`}>INVENTORY</button>
          <button onClick={() => {setActiveTab('orders'); setIsSidebarOpen(false)}} className={`w-full text-left p-3 rounded-lg text-xs font-bold transition-all ${activeTab === 'orders' ? 'bg-[#F2C4CE]/10 text-[#F2C4CE] border border-[#F2C4CE]/20' : 'text-gray-400 hover:bg-white/5'}`}>ORDER LOGS</button>
          <button onClick={() => {setActiveTab('suppliers'); setIsSidebarOpen(false)}} className={`w-full text-left p-3 rounded-lg text-xs font-bold transition-all ${activeTab === 'suppliers' ? 'bg-[#F2C4CE]/10 text-[#F2C4CE] border border-[#F2C4CE]/20' : 'text-gray-400 hover:bg-white/5'}`}>SUPPLIER HUB</button>
          <button onClick={() => {setActiveTab('reports'); setIsSidebarOpen(false)}} className={`w-full text-left p-3 rounded-lg text-xs font-bold transition-all ${activeTab === 'reports' ? 'bg-[#F2C4CE]/10 text-[#F2C4CE] border border-[#F2C4CE]/20' : 'text-gray-400 hover:bg-white/5'}`}>REPORTS</button>
          {user.role === 'Manager' && (
            <button onClick={() => {setActiveTab('users'); setIsSidebarOpen(false)}} className={`w-full text-left p-3 rounded-lg text-xs font-bold transition-all ${activeTab === 'users' ? 'bg-[#F2C4CE]/10 text-[#F2C4CE] border border-[#F2C4CE]/20' : 'text-gray-400 hover:bg-white/5'}`}>PERSONNEL</button>
          )}
        </nav>

        <div className="p-4 border-t border-[#5A595E]/30 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[9px] text-gray-500 uppercase font-bold">{user.role}</span>
            <span className="text-[10px] text-white font-bold truncate max-w-[120px]">{user.name}</span>
          </div>
          <button onClick={handleLogout} className="text-[9px] text-[#F58F7C] font-bold uppercase underline">Logout</button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col z-10 h-screen overflow-y-auto">
        <header className="h-16 border-b border-[#5A595E] flex items-center justify-between px-8 bg-[#2C2B30]/60 backdrop-blur-md sticky top-0 z-20">
          <button className="md:hidden p-2 text-gray-400" onClick={() => setIsSidebarOpen(true)}><Menu size={24}/></button>
          <div className="relative w-1/3 hidden sm:block">
            <input type="text" placeholder="Search product or SKU..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-[#232226] border border-[#5A595E] rounded-full py-2 px-10 text-xs outline-none focus:border-[#F2C4CE] transition-all" />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 transition-colors"><SearchIcon /></span>
          </div>

          <div className="flex gap-4 items-center">
            <button onClick={() => setShowNotifications(!showNotifications)} className="relative p-2 text-gray-400 hover:text-[#F2C4CE] transition">
              <BellIcon />
              {(lowStockAlerts.length + pendingOutbound.length) > 0 && (
                <span className="absolute top-0 right-0 bg-[#F2C4CE] text-[#2C2B30] text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-[0_0_8px_#F2C4CE]">
                  {lowStockAlerts.length + pendingOutbound.length}
                </span>
              )}
            </button>
            <button onClick={() => setShowOrderModal(true)} className="text-[10px] bg-[#F2C4CE] text-[#2C2B30] px-4 py-2 rounded font-bold uppercase hover:brightness-110 transition">NEW ORDER</button>
          </div>
        </header>

        {showNotifications && (
          <div className="absolute right-8 top-20 w-80 bg-[#36353A] border border-[#5A595E] rounded-2xl shadow-2xl z-[150] overflow-hidden">
            <div className="p-4 bg-[#232226] border-b border-[#5A595E] text-[10px] font-bold uppercase tracking-widest text-[#F2C4CE]">Alert Center</div>
            <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
              <div className="p-4 border-b border-white/5 bg-[#F58F7C]/5">
                <p className="text-[9px] text-[#F58F7C] font-bold mb-3 uppercase tracking-tighter">Supply Side Restock</p>
                {lowStockAlerts.length === 0 && <p className="text-[10px] text-gray-500 italic">Inventory stable.</p>}
                {lowStockAlerts.map(p => (
                  <div key={p._id} className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg mb-2">
                    <p className="text-[10px] font-bold text-red-400">{p.name} critical!</p>
                    {p.warehouses?.map(wh => wh.stock <= (p.reorderThreshold / 2) && (
                       <p key={wh.name} className="text-[8px] text-gray-400">Lacking: {wh.name} ({wh.stock}u)</p>
                    ))}
                    <button onClick={() => {setShowOrderModal(true); setNewOrder({...newOrder, product: p._id, orderType: 'Inbound'})}} className="mt-2 text-[8px] border border-red-400 text-red-400 px-2 py-1 rounded font-bold uppercase">Restock Form</button>
                  </div>
                ))}
              </div>
              <div className="p-4 bg-[#78DC8C]/5">
                <p className="text-[9px] text-[#78DC8C] font-bold mb-3 uppercase tracking-tighter">Customer Fulfillment</p>
                {pendingOutbound.length === 0 && <p className="text-[10px] text-gray-500 italic">No shipments pending.</p>}
                {pendingOutbound.map(o => (
                  <div key={o._id} className="bg-green-500/10 border border-green-500/20 p-3 rounded-lg mb-2">
                    <p className="text-[10px] font-bold text-green-400">Order for: {o.product?.name}</p>
                    <button onClick={() => handleDeliver(o._id, 'Outbound')} className="mt-2 text-[8px] border border-green-400 text-green-400 px-2 py-1 rounded font-bold uppercase">Confirm Delivery</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="p-8">
          {activeTab === 'inventory' && (
            <>
              <div className="flex gap-2 mb-8 overflow-x-auto pb-2 custom-scrollbar">
                {categories.map(cat => (
                  <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-4 py-1.5 rounded-full text-[10px] font-bold border transition-all whitespace-nowrap ${selectedCategory === cat ? 'bg-[#F2C4CE] text-[#2C2B30] border-[#F2C4CE]' : 'border-[#5A595E] text-gray-500 hover:border-gray-400'}`}>
                    {cat.toUpperCase()}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProducts.map(p => (
                  <div key={p._id} className={`p-6 rounded-xl border bg-[#36353A]/40 backdrop-blur-sm transition-all duration-500 flex flex-col justify-between min-h-[240px] ${getCardStyle(p.totalStock, p.isLowStock)}`}>
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="font-bold text-white text-sm pr-4">{p.name}</h3>
                      {p.isLowStock && <span className="text-[8px] bg-[#F2C4CE] text-[#2C2B30] px-2 py-1 rounded font-black whitespace-nowrap shadow-[0_0_8px_#F2C4CE]">LOW STOCK</span>}
                    </div>

                    <div className="mb-4 grid grid-cols-2 gap-2">
                      {['Warehouse A', 'Warehouse B'].map(whName => {
                        const entry = p.warehouses?.find(w => w.name === whName);
                        const currentStock = entry ? entry.stock : 0;
                        return (
                          <div key={whName} className="bg-black/20 p-2 rounded border border-white/5">
                            <p className="text-[8px] text-gray-500 uppercase font-bold">{whName}</p>
                            <p className={`text-[10px] font-bold ${currentStock <= 5 ? 'text-red-400' : 'text-gray-300'}`}>{currentStock} units</p>
                          </div>
                        );
                      })}
                    </div>

                    <div className="space-y-2 text-[10px]">
                      <div className="flex justify-between border-b border-white/5 pb-1"><span className="text-gray-500 uppercase font-bold">SKU</span><span className="text-[#F58F7C] font-mono">{p.sku}</span></div>
                      <div className="flex justify-between border-b border-white/5 pb-1"><span className="text-gray-500 uppercase font-bold">Unit Price</span><span className="text-white">₱{p.price?.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500 uppercase font-bold">Stock Level</span><span className={`font-bold ${getUnitColor(p.totalStock, p.isLowStock)}`}>{p.totalStock} units</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === 'orders' && (
            <div className="bg-[#36353A]/40 border border-[#5A595E] rounded-xl overflow-hidden shadow-2xl">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-[#232226] text-gray-500 uppercase border-b border-[#5A595E]">
                  <tr><th className="p-4">Date/Time</th><th className="p-4">Product</th><th className="p-4">Type</th><th className="p-4">Warehouse</th><th className="p-4 text-right">Action</th></tr>
                </thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o._id} className="border-b border-white/5 hover:bg-white/5 transition">
                      <td className="p-4 text-gray-500 text-[9px]">{new Date(o.createdAt).toLocaleString()}</td>
                      <td className="p-4 font-bold">{o.product?.name || "N/A"}</td>
                      <td className="p-4 text-gray-400">{o.orderType}</td>
                      <td className="p-4 text-[#F2C4CE] font-bold">{o.warehouse}</td>
                      <td className="p-4 text-right">
                        {o.status !== 'Delivered' ? (
                          <button onClick={() => handleDeliver(o._id, o.orderType)} className="text-[#F2C4CE] underline uppercase font-bold hover:text-white transition">Mark Delivered</button>
                        ) : (
                          <span className="text-[#78DC8C] text-[9px] uppercase font-bold">COMPLETED</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'suppliers' && (
            <div className="bg-[#36353A]/40 border border-[#5A595E] rounded-xl overflow-hidden shadow-2xl">
              <div className="p-4 bg-[#232226] border-b border-[#5A595E] text-[10px] font-bold uppercase text-[#F2C4CE] tracking-widest">Supply Network</div>
              <table className="w-full text-left text-[11px]">
                <thead className="bg-black/20 text-gray-500 uppercase">
                  <tr><th className="p-4">Supplier</th><th className="p-4">Contact</th><th className="p-4">Email</th><th className="p-4">Address</th></tr>
                </thead>
                <tbody>
                  {suppliers.map(s => (
                    <tr key={s._id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="p-4 font-bold">{s.name}</td>
                      <td className="p-4 text-gray-400">{s.contactPerson}</td>
                      <td className="p-4">{s.email}</td>
                      <td className="p-4 text-gray-500 text-[10px]">{s.address}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-sm font-bold uppercase tracking-widest text-[#F2C4CE]">Supply Chain Intelligence</h2>
                <button onClick={exportToCSV} className="bg-[#F2C4CE] text-[#2C2B30] px-4 py-2 rounded font-bold text-[10px] flex items-center gap-2 hover:brightness-110">
                  <Download size={14}/> EXPORT ANALYTICS
                </button>
              </div>
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

              <div className="bg-[#36353A]/40 border border-[#5A595E] rounded-2xl overflow-hidden shadow-2xl">
                <div className="p-4 bg-[#232226] border-b border-[#5A595E] text-[10px] font-bold uppercase tracking-widest text-[#F2C4CE]">Financial Breakdown</div>
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-black/20 text-gray-500 uppercase">
                    <tr><th className="p-4">Product Name</th><th className="p-4">Unit Price</th><th className="p-4">Total Units</th><th className="p-4 text-right">Sub-Total Value</th></tr>
                  </thead>
                  <tbody>
                    {products.map(p => (
                      <tr key={p._id} className="border-b border-white/5 hover:bg-white/5 transition">
                        <td className="p-4 font-bold">{p.name}</td>
                        <td className="p-4">₱{p.price?.toLocaleString()}</td>
                        <td className="p-4">{p.totalStock} units</td>
                        <td className="p-4 text-right font-bold text-[#78DC8C]">₱{(p.price * p.totalStock).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {user.role === 'Manager' && (
                <div className="bg-[#36353A]/40 border border-[#5A595E] rounded-2xl overflow-hidden">
                  <div className="p-4 bg-[#232226] border-b border-[#5A595E] flex items-center gap-2 text-[10px] font-bold text-[#F2C4CE] uppercase">
                    <ShieldCheck size={16}/> Node Activity Logs
                  </div>
                  <div className="p-4 space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                    {orders.slice(0, 8).map(o => (
                      <div key={o._id} className="text-[10px] flex items-center gap-3 border-l-2 border-[#F2C4CE] pl-3 py-1 bg-white/5">
                        <span className="text-gray-500">[{new Date(o.createdAt).toLocaleTimeString()}]</span>
                        <span className="text-white">Order {o._id.slice(-5)} updated to <b className="text-[#78DC8C]">{o.status}</b></span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'users' && user.role === 'Manager' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1 bg-[#36353A]/40 border border-[#5A595E] p-8 rounded-2xl shadow-xl h-fit">
                <h3 className="text-sm font-bold text-[#F2C4CE] uppercase mb-6 tracking-widest">Register New Staff</h3>
                <form onSubmit={handleRegisterStaff} className="space-y-4">
                  <div><label className="text-[10px] text-gray-500 uppercase font-bold">Full Name</label><input type="text" value={newStaff.name} onChange={(e) => setNewStaff({...newStaff, name: e.target.value})} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs text-white" required /></div>
                  <div><label className="text-[10px] text-gray-500 uppercase font-bold">Email</label><input type="email" value={newStaff.email} onChange={(e) => setNewStaff({...newStaff, email: e.target.value})} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs text-white" required /></div>
                  <div><label className="text-[10px] text-gray-500 uppercase font-bold">Password</label><input type="password" value={newStaff.password} onChange={(e) => setNewStaff({...newStaff, password: e.target.value})} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs text-white" required /></div>
                  <button type="submit" className="w-full bg-[#F2C4CE] text-[#2C2B30] py-4 rounded font-bold uppercase text-[10px] tracking-widest shadow-lg hover:brightness-110 transition-all">Authorize Access</button>
                </form>
              </div>
              <div className="lg:col-span-2 bg-[#36353A]/40 border border-[#5A595E] rounded-2xl overflow-hidden shadow-2xl">
                <div className="p-4 bg-[#232226] border-b border-[#5A595E] text-[10px] font-bold uppercase tracking-widest text-[#F2C4CE]">Authorized Personnel</div>
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-black/20 text-gray-500 uppercase border-b border-[#5A595E]">
                    <tr><th className="p-4">Name</th><th className="p-4">Email</th><th className="p-4">Role</th><th className="p-4 text-right">Action</th></tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u._id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="p-4 font-bold">{u.name}</td>
                        <td className="p-4 text-gray-400">{u.email}</td>
                        <td className="p-4"><span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${u.role === 'Manager' ? 'bg-[#F2C4CE]/20 text-[#F2C4CE]' : 'bg-white/10 text-gray-400'}`}>{u.role.toUpperCase()}</span></td>
                        <td className="p-4 text-right">{u._id !== user._id && <button onClick={() => handleDeactivateUser(u._id)} className="text-[#F58F7C] hover:text-red-400 font-bold uppercase underline text-[9px] transition-colors">Revoke</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      {showOrderModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <form onSubmit={handleCreateOrder} className="bg-[#36353A] border border-[#5A595E] p-8 rounded-2xl w-full max-w-md space-y-5 shadow-2xl">
            <h3 className="text-sm font-bold text-[#F2C4CE] uppercase tracking-widest border-b border-white/10 pb-4">Initialize Stock Transfer</h3>
            <div className="space-y-1"><label className="text-[10px] text-gray-500 uppercase font-bold">Transfer Type</label><select className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs text-white font-bold" onChange={(e) => setNewOrder({...newOrder, orderType: e.target.value})} value={newOrder.orderType}><option value="Inbound">Restock (From Supplier)</option><option value="Outbound">Sale (To Customer)</option></select></div>
            <div className="space-y-1"><label className="text-[10px] text-gray-500 uppercase font-bold">Product</label><select className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs text-white" onChange={(e) => setNewOrder({...newOrder, product: e.target.value})} required value={newOrder.product}><option value="">-- Choose Product --</option>{products.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}</select></div>
            <div className="space-y-1"><label className="text-[10px] text-gray-500 uppercase font-bold">Supplier</label><select className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs text-white" onChange={(e) => setNewOrder({...newOrder, supplier: e.target.value})} required value={newOrder.supplier}><option value="">-- Select Partner --</option>{suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</select></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><label className="text-[10px] text-gray-500 uppercase font-bold">Quantity</label><input type="number" className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs text-white outline-none" onChange={(e) => setNewOrder({...newOrder, quantity: parseInt(e.target.value)})} required /></div>
              <div className="space-y-1"><label className="text-[10px] text-gray-500 uppercase font-bold">Target Hub</label><select className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs text-white" onChange={(e) => setNewOrder({...newOrder, warehouse: e.target.value})}><option value="Warehouse A">Warehouse A</option><option value="Warehouse B">Warehouse B</option></select></div>
            </div>
            <div className="flex gap-4 pt-4"><button type="submit" className="flex-1 bg-[#F2C4CE] text-[#2C2B30] font-bold py-4 rounded text-xs uppercase shadow-lg hover:brightness-110">Authorize</button><button type="button" onClick={() => setShowOrderModal(false)} className="flex-1 border border-[#5A595E] text-gray-400 font-bold py-4 rounded text-xs uppercase hover:bg-white/5 transition">Cancel</button></div>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;