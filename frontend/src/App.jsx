import { useState, useEffect, useRef } from 'react';
import { fetchProducts, fetchOrders, fetchSuppliers, createOrder, createProduct, updateOrderStatus, createSupplier, updateSupplier, deleteSupplier, fetchWarehouses, createWarehouse, updateWarehouse, deleteWarehouse } from './api/inventory';
import Login from './components/Login';
import { Menu, X, Download, ShieldCheck, Users, Package, Truck, LayoutDashboard } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
const getActiveTabStorageKey = (userId) => `lumiere_active_tab_${userId}`;
const getSupplierSubTabStorageKey = (userId) => `lumiere_supplier_subtab_${userId}`;

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
  const defaultOrderForm = {
    product: '',
    supplier: '',
    quantity: 0,
    warehouse: '',
    orderType: 'Inbound'
  };

  const [user, setUser] = useState(JSON.parse(localStorage.getItem('lumiere_user')));
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [users, setUsers] = useState([]); 
  const [activeTab, setActiveTab] = useState(() => {
    const storedUser = JSON.parse(localStorage.getItem('lumiere_user'));
    if (!storedUser?._id) return 'inventory';
    return localStorage.getItem(getActiveTabStorageKey(storedUser._id)) || 'inventory';
  });
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [successMessage, setSuccessMessage] = useState(''); 
  const [errorMessage, setErrorMessage] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationsPanelRef = useRef(null);
  const notificationsButtonRef = useRef(null);
  const previousUserIdRef = useRef(user?._id ?? null);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); 
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [supplierSubTab, setSupplierSubTab] = useState(() => {
    const storedUser = JSON.parse(localStorage.getItem('lumiere_user'));
    if (!storedUser?._id) return 'network';
    return localStorage.getItem(getSupplierSubTabStorageKey(storedUser._id)) || 'network';
  });

  const [newOrder, setNewOrder] = useState(defaultOrderForm);

  const [newStaff, setNewStaff] = useState({
    name: '', email: '', password: '', role: 'Staff'
  });
  const [editingUserId, setEditingUserId] = useState(null);
  const [editingSupplierId, setEditingSupplierId] = useState(null);
  const [editingWarehouseId, setEditingWarehouseId] = useState(null);
  const [newProduct, setNewProduct] = useState({
    name: '',
    sku: '',
    category: '',
    supplier: '',
    price: '',
    reorderThreshold: 10,
  });
  const [showCategorySuggestions, setShowCategorySuggestions] = useState(false);
  const [supplierForm, setSupplierForm] = useState({
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    leadTimeDays: 7,
  });
  const [warehouseForm, setWarehouseForm] = useState({
    name: '',
    address: '',
  });
  const canManageOrders = ['Manager', 'SuperAdmin'].includes(user?.role);

  useEffect(() => {
    if (user) {
      loadData();
      if (['Manager', 'SuperAdmin'].includes(user.role)) fetchUsers();
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      previousUserIdRef.current = null;
      setActiveTab('inventory');
      setSupplierSubTab('network');
      return;
    }

    if (previousUserIdRef.current !== user._id) {
      previousUserIdRef.current = user._id;
      setActiveTab(localStorage.getItem(getActiveTabStorageKey(user._id)) || 'inventory');
      setSupplierSubTab(localStorage.getItem(getSupplierSubTabStorageKey(user._id)) || 'network');
      setIsSidebarOpen(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const canViewUsers = ['Manager', 'SuperAdmin'].includes(user.role);
    const canViewSuppliers = ['Manager', 'SuperAdmin'].includes(user.role);
    const canViewReports = ['Manager', 'SuperAdmin'].includes(user.role);

    if (
      (activeTab === 'users' && !canViewUsers) ||
      (activeTab === 'suppliers' && !canViewSuppliers) ||
      (activeTab === 'reports' && !canViewReports)
    ) {
      setActiveTab('inventory');
    }
  }, [activeTab, user]);

  useEffect(() => {
    if (!user?._id) return;
    localStorage.setItem(getActiveTabStorageKey(user._id), activeTab);
  }, [activeTab, user]);

  useEffect(() => {
    if (!user?._id) return;
    localStorage.setItem(getSupplierSubTabStorageKey(user._id), supplierSubTab);
  }, [supplierSubTab, user]);

  useEffect(() => {
    if (!showNotifications) return;

    const handleOutsideClick = (event) => {
      if (
        notificationsPanelRef.current?.contains(event.target) ||
        notificationsButtonRef.current?.contains(event.target)
      ) {
        return;
      }

      setShowNotifications(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showNotifications]);

  const loadData = async () => {
    try {
      const pData = await fetchProducts();
      const oData = await fetchOrders();
      const sData = await fetchSuppliers();
      const wData = await fetchWarehouses();
      setProducts(pData || []);
      setOrders(oData || []);
      setSuppliers(sData || []);
      setWarehouses(wData || []);
    } catch (error) {
      console.error("Critical System Sync Error:", error);
    }
  };

  const fetchUsers = async () => {
    try {
      // FIX: Used backticks for template literal[cite: 33]
      const response = await fetch(`${API_BASE}/users`, {
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
    setErrorMessage('');
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const triggerError = (msg) => {
    setSuccessMessage('');
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(''), 4000);
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

  const resetOrderForm = (overrides = {}) => {
    const nextProductId = overrides.product || defaultOrderForm.product;
    const selectedProduct = products.find((product) => product._id === nextProductId);
    const selectedSupplierId = selectedProduct?.supplier?._id || selectedProduct?.supplier || '';

    setNewOrder({
      ...defaultOrderForm,
      warehouse: warehouses[0]?.name || defaultOrderForm.warehouse,
      ...overrides,
      supplier: overrides.supplier ?? selectedSupplierId,
    });
  };

  const openNewOrderModal = (overrides = {}) => {
    resetOrderForm(overrides);
    setShowOrderModal(true);
  };

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    try {
      await createOrder(newOrder);
      resetOrderForm();
      setShowOrderModal(false);
      setShowNotifications(false); 
      triggerSuccess(`Successful: ${newOrder.orderType} transfer initiated.`);
      loadData();
    } catch (error) {
      triggerError(error.message);
    }
  };

  const handleDeliver = async (id, type) => {
    try {
      await updateOrderStatus(id, 'Delivered');
      triggerSuccess(`System Update: ${type} transfer confirmed.`);
      loadData(); 
    } catch (error) {
      triggerError(error.message);
    }
  };

  const resetProductForm = () => {
    setNewProduct({
      name: '',
      sku: '',
      category: '',
      supplier: '',
      price: '',
      reorderThreshold: 10,
    });
    setShowCategorySuggestions(false);
  };

  const resetSupplierForm = () => {
    setSupplierForm({
      name: '',
      contactPerson: '',
      email: '',
      phone: '',
      address: '',
      leadTimeDays: 7,
    });
    setEditingSupplierId(null);
  };

  const resetWarehouseForm = () => {
    setWarehouseForm({ name: '', address: '' });
    setEditingWarehouseId(null);
  };

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    try {
      await createProduct(newProduct);
      resetProductForm();
      setShowProductModal(false);
      triggerSuccess(`Product created: ${newProduct.name}`);
      loadData();
    } catch (error) {
      triggerError(error.message);
    }
  };

  const handleCancelOrder = async (id) => {
    try {
      await updateOrderStatus(id, 'Cancelled');
      triggerSuccess('Order cancelled successfully.');
      loadData();
    } catch (error) {
      triggerError(error.message);
    }
  };

  const handleSupplierSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingSupplierId) {
        await updateSupplier(editingSupplierId, supplierForm);
        triggerSuccess(`Supplier updated: ${supplierForm.name}`);
      } else {
        await createSupplier(supplierForm);
        triggerSuccess(`Supplier added: ${supplierForm.name}`);
      }
      resetSupplierForm();
      setShowSupplierModal(false);
      loadData();
    } catch (error) {
      triggerError(error.message);
    }
  };

  const handleDeleteSupplier = async (id) => {
    if (!window.confirm('Remove this supplier?')) return;
    try {
      await deleteSupplier(id);
      triggerSuccess('Supplier removed.');
      loadData();
    } catch (error) {
      triggerError(error.message);
    }
  };

  const startEditingSupplier = (supplier) => {
    setEditingSupplierId(supplier._id);
    setSupplierForm({
      name: supplier.name || '',
      contactPerson: supplier.contactPerson || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
      leadTimeDays: supplier.leadTimeDays ?? 7,
    });
    setShowSupplierModal(true);
  };

  const handleWarehouseSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingWarehouseId) {
        await updateWarehouse(editingWarehouseId, warehouseForm);
        triggerSuccess(`Warehouse updated: ${warehouseForm.name}`);
      } else {
        await createWarehouse(warehouseForm);
        triggerSuccess(`Warehouse added: ${warehouseForm.name}`);
      }
      resetWarehouseForm();
      setShowWarehouseModal(false);
      loadData();
    } catch (error) {
      triggerError(error.message);
    }
  };

  const handleDeleteWarehouse = async (id) => {
    if (!window.confirm('Remove this warehouse?')) return;
    try {
      await deleteWarehouse(id);
      triggerSuccess('Warehouse removed.');
      loadData();
    } catch (error) {
      triggerError(error.message);
    }
  };

  const startEditingWarehouse = (warehouse) => {
    setEditingWarehouseId(warehouse._id);
    setWarehouseForm({
      name: warehouse.name || '',
      address: warehouse.address || '',
    });
    setShowWarehouseModal(true);
  };

  const handleRegisterStaff = async (e) => {
    e.preventDefault();
    const isEditing = Boolean(editingUserId);
    const payload = {
      name: newStaff.name,
      email: newStaff.email,
      password: newStaff.password,
      ...(isEditing ? {} : { role: newStaff.role }),
    };
    const response = await fetch(isEditing ? `${API_BASE}/users/${editingUserId}` : `${API_BASE}/users`, {
      method: isEditing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      const updatedUser = await response.json();
      triggerSuccess(isEditing ? `Account updated: ${newStaff.name}` : `New Node Authorized: ${newStaff.name}`);
      setNewStaff({ name: '', email: '', password: '', role: 'Staff' });
      setEditingUserId(null);
      if (isEditing && updatedUser._id === user._id) {
        const nextSessionUser = {
          ...user,
          name: updatedUser.name,
          email: updatedUser.email,
          role: updatedUser.role,
        };
        localStorage.setItem('lumiere_user', JSON.stringify(nextSessionUser));
        setUser(nextSessionUser);
      }
      fetchUsers();
    } else {
      const data = await response.json();
      triggerError(data.message || `Unable to ${isEditing ? 'update' : 'create'} account.`);
    }
  };

  const handleDeactivateUser = async (id) => {
    if (window.confirm("Revoke access for this user?")) {
      const response = await fetch(`${API_BASE}/users/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${user.token}` }
      });
      if (response.ok) {
        triggerSuccess("User deactivated.");
        fetchUsers();
      } else {
        const data = await response.json();
        triggerError(data.message || 'Unable to revoke user.');
      }
    }
  };

  const existingCategories = [...new Set(products.map(p => p.category).filter(Boolean))];
  const categories = ['All', ...existingCategories];
  const filteredCategorySuggestions = existingCategories.filter((category) =>
    newProduct.category.trim()
      ? category.toLowerCase().includes(newProduct.category.toLowerCase())
      : true
  );
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const lowStockAlerts = products.filter(p => p.isLowStock);
  const pendingOutbound = orders.filter(o => o.orderType === 'Outbound' && !['Delivered', 'Cancelled'].includes(o.status));
  const totalValue = products.reduce((acc, p) => acc + (p.price * p.totalStock), 0);
  const lowStockCount = products.filter(p => p.isLowStock).length;
  const warehouseNames = warehouses.map((warehouse) => warehouse.name);
  const selectedOrderProduct = products.find((product) => product._id === newOrder.product);
  const selectedOrderSupplierName = selectedOrderProduct?.supplier?.name || suppliers.find((supplier) => supplier._id === newOrder.supplier)?.name || '';
  const warehouseTotals = products.reduce((acc, product) => {
    (product.warehouses || []).forEach((warehouse) => {
      acc[warehouse.name] = (acc[warehouse.name] || 0) + warehouse.stock;
    });
    return acc;
  }, Object.fromEntries(warehouseNames.map((name) => [name, 0])));
  const rolePriority = { SuperAdmin: 0, Manager: 1, Staff: 2 };
  const sortedUsers = [...users].sort((a, b) => {
    const roleDiff = (rolePriority[a.role] ?? 99) - (rolePriority[b.role] ?? 99);
    if (roleDiff !== 0) return roleDiff;
    return a.name.localeCompare(b.name);
  });
  const getOrderActor = (order) => {
    const name = order.createdBy?.name || order.createdByName || 'Lumiere Manager';
    const rawRole = order.createdBy?.role || order.createdByRole;
    return {
      name,
      role: !rawRole || rawRole === 'Unknown' ? 'Manager' : rawRole,
    };
  };
  const canEditUser = (targetUser) => {
    if (user.role === 'SuperAdmin') return targetUser.role !== 'SuperAdmin' || targetUser._id === user._id;
    if (user.role === 'Manager') {
      if (targetUser._id === user._id) return true;
      return targetUser.role === 'Staff' && targetUser.createdBy?._id === user._id;
    }
    return false;
  };
  const startEditingUser = (targetUser) => {
    setEditingUserId(targetUser._id);
    setNewStaff({
      name: targetUser.name,
      email: targetUser.email,
      password: '',
      role: targetUser.role,
    });
  };
  const resetPersonnelForm = () => {
    setEditingUserId(null);
    setNewStaff({ name: '', email: '', password: '', role: 'Staff' });
  };

  if (!user) return <Login setAuthUser={setUser} />;

  return (
    <div className="flex min-h-screen bg-[#2C2B30] relative overflow-hidden text-gray-200 font-mono">
      {successMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] bg-green-500 text-white px-8 py-3 rounded-full shadow-2xl font-bold text-[10px] uppercase tracking-widest animate-bounce">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] bg-red-500 text-white px-8 py-3 rounded-full shadow-2xl font-bold text-[10px] uppercase tracking-widest">
          {errorMessage}
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
          {['Manager', 'SuperAdmin'].includes(user.role) && <button onClick={() => {setActiveTab('suppliers'); setSupplierSubTab('network'); setIsSidebarOpen(false)}} className={`w-full text-left p-3 rounded-lg text-xs font-bold transition-all ${activeTab === 'suppliers' ? 'bg-[#F2C4CE]/10 text-[#F2C4CE] border border-[#F2C4CE]/20' : 'text-gray-400 hover:bg-white/5'}`}>SUPPLIER HUB</button>}
          {activeTab === 'suppliers' && ['Manager', 'SuperAdmin'].includes(user.role) && (
            <div className="ml-3 mt-1 space-y-2 border-l border-[#5A595E]/40 pl-3">
              <button onClick={() => {setSupplierSubTab('network'); setIsSidebarOpen(false)}} className={`w-full text-left p-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${supplierSubTab === 'network' ? 'bg-[#F2C4CE]/10 text-[#F2C4CE] border border-[#F2C4CE]/20' : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'}`}>Supply Network</button>
              <button onClick={() => {setSupplierSubTab('warehouses'); setIsSidebarOpen(false)}} className={`w-full text-left p-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${supplierSubTab === 'warehouses' ? 'bg-[#F58F7C]/10 text-[#F58F7C] border border-[#F58F7C]/20' : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'}`}>Warehouse Directory</button>
            </div>
          )}
          {['Manager', 'SuperAdmin'].includes(user.role) && <button onClick={() => {setActiveTab('reports'); setIsSidebarOpen(false)}} className={`w-full text-left p-3 rounded-lg text-xs font-bold transition-all ${activeTab === 'reports' ? 'bg-[#F2C4CE]/10 text-[#F2C4CE] border border-[#F2C4CE]/20' : 'text-gray-400 hover:bg-white/5'}`}>REPORTS</button>}
          {['Manager', 'SuperAdmin'].includes(user.role) && (
            <button onClick={() => {setActiveTab('users'); setIsSidebarOpen(false)}} className={`w-full text-left p-3 rounded-lg text-xs font-bold transition-all ${activeTab === 'users' ? 'bg-[#F2C4CE]/10 text-[#F2C4CE] border border-[#F2C4CE]/20' : 'text-gray-400 hover:bg-white/5'}`}>PERSONNEL</button>
          )}
        </nav>

        <div className="border-t border-[#5A595E]/30 p-4">
          <div className="rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className={`inline-flex rounded-full px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.18em] ${user.role === 'SuperAdmin' ? 'bg-[#F58F7C]/18 text-[#F7AA9A]' : user.role === 'Manager' ? 'bg-[#F2C4CE]/18 text-[#F2C4CE]' : 'bg-white/8 text-gray-400'}`}>
                  {user.role}
                </span>
                <p className="mt-2 truncate text-[11px] font-bold text-white">{user.name}</p>
              </div>
              <button onClick={handleLogout} className="rounded-full border border-[#F58F7C]/25 bg-[#F58F7C]/8 px-3 py-1.5 text-[8px] font-bold uppercase tracking-[0.16em] text-[#F6B1A1] transition hover:bg-[#F58F7C]/16 hover:text-white">
                Logout
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col z-10 h-screen overflow-y-auto custom-scrollbar">
        <header className="h-16 border-b border-[#5A595E] flex items-center justify-between px-8 bg-[#2C2B30]/60 backdrop-blur-md sticky top-0 z-20">
          <button className="md:hidden p-2 text-gray-400" onClick={() => setIsSidebarOpen(true)}><Menu size={24}/></button>
          <div className="relative w-1/3 hidden sm:block">
            <input type="text" placeholder="Search product or SKU..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-[#232226] border border-[#5A595E] rounded-full py-2 px-10 text-xs outline-none focus:border-[#F2C4CE] transition-all" />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 transition-colors"><SearchIcon /></span>
          </div>

          <div className="flex gap-4 items-center">
            <button ref={notificationsButtonRef} onClick={() => setShowNotifications(!showNotifications)} className="relative p-2 text-gray-400 hover:text-[#F2C4CE] transition">
              <BellIcon />
              {(lowStockAlerts.length + pendingOutbound.length) > 0 && (
                <span className="absolute top-0 right-0 bg-[#F2C4CE] text-[#2C2B30] text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-[0_0_8px_#F2C4CE]">
                  {lowStockAlerts.length + pendingOutbound.length}
                </span>
              )}
            </button>
            {user.role === 'SuperAdmin' && <button onClick={() => { resetProductForm(); setShowProductModal(true); }} className="text-[10px] border border-[#F58F7C] text-[#F58F7C] px-4 py-2 rounded font-bold uppercase hover:bg-[#F58F7C]/10 transition">NEW PRODUCT</button>}
            {canManageOrders && <button onClick={() => openNewOrderModal()} className="text-[10px] bg-[#F2C4CE] text-[#2C2B30] px-4 py-2 rounded font-bold uppercase hover:brightness-110 transition">NEW ORDER</button>}
            <button onClick={loadData} className="text-[10px] border border-[#5A595E] text-white px-4 py-2 rounded font-bold uppercase hover:bg-white/5">SYNC DB</button>
          </div>
        </header>

        {showNotifications && (
          <div ref={notificationsPanelRef} className="absolute right-8 top-20 w-80 overflow-hidden rounded-3xl border border-white/10 bg-[#2E2D31]/95 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl z-[150]">
            <div className="border-b border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#F2C4CE]">Alert Center</p>
              <p className="mt-1 text-[10px] text-gray-500">Priority updates for stock and fulfillment.</p>
            </div>
            <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
              <div className="border-b border-white/5 bg-[linear-gradient(180deg,rgba(245,143,124,0.06),rgba(245,143,124,0.02))] p-5">
                <p className="mb-3 text-[9px] font-bold uppercase tracking-[0.18em] text-[#F5A28F]">Supply Side Restock</p>
                {lowStockAlerts.length === 0 && <p className="text-[10px] text-gray-500 italic">Inventory stable.</p>}
                {lowStockAlerts.map(p => (
                  <div key={p._id} className="mb-3 rounded-2xl border border-[#F58F7C]/18 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(245,143,124,0.06))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] last:mb-0">
                    <p className="text-[10px] font-bold leading-relaxed text-[#F6B1A1]">{p.name} critical!</p>
                    {canManageOrders && <button onClick={() => openNewOrderModal({ product: p._id, orderType: 'Inbound' })} className="mt-3 rounded-full border border-[#F5A28F]/35 bg-[#F58F7C]/10 px-3 py-1.5 text-[8px] font-bold uppercase tracking-[0.16em] text-[#F7C0B4] transition hover:bg-[#F58F7C]/18 hover:text-white">Restock Form</button>}
                  </div>
                ))}
              </div>
              <div className="bg-[linear-gradient(180deg,rgba(120,220,140,0.05),rgba(120,220,140,0.02))] p-5">
                <p className="mb-3 text-[9px] font-bold uppercase tracking-[0.18em] text-[#92E2A1]">Customer Fulfillment</p>
                {pendingOutbound.length === 0 && <p className="text-[10px] text-gray-500 italic">No shipments pending.</p>}
                {pendingOutbound.map(o => (
                  <div key={o._id} className="mb-3 rounded-2xl border border-[#78DC8C]/16 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(120,220,140,0.05))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] last:mb-0">
                    <p className="text-[10px] font-bold leading-relaxed text-[#AAE8B3]">Order for: {o.product?.name}</p>
                    {canManageOrders ? (
                      <div className="mt-2 flex gap-2">
                        <button onClick={() => handleDeliver(o._id, 'Outbound')} className="rounded-full border border-[#78DC8C]/30 bg-[#78DC8C]/10 px-3 py-1.5 text-[8px] font-bold uppercase tracking-[0.16em] text-[#B8F0C1] transition hover:bg-[#78DC8C]/18 hover:text-white">Confirm Delivery</button>
                        <button onClick={() => handleCancelOrder(o._id)} className="rounded-full border border-[#F5A28F]/25 bg-[#F58F7C]/8 px-3 py-1.5 text-[8px] font-bold uppercase tracking-[0.16em] text-[#EAB0A3] transition hover:bg-[#F58F7C]/16 hover:text-white">Cancel</button>
                      </div>
                    ) : (
                      <p className="mt-2 text-[8px] uppercase tracking-[0.16em] text-gray-500">Pending review</p>
                    )}
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
                      {warehouseNames.map(whName => {
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
                  <tr><th className="p-4">Date/Time</th><th className="p-4">Ordered By</th><th className="p-4">Product</th><th className="p-4">Type</th><th className="p-4">Warehouse</th><th className="p-4 text-right">Action</th></tr>
                </thead>
                <tbody>
                  {orders.map(o => {
                    const actor = getOrderActor(o);
                    return (
                    <tr key={o._id} className="border-b border-white/5 hover:bg-white/5 transition">
                      <td className="p-4 text-gray-500 text-[9px]">{new Date(o.createdAt).toLocaleString()}</td>
                      <td className="p-4">
                        <div className="font-bold text-white">{actor.name}</div>
                        <div className={`text-[9px] uppercase font-black ${actor.role === 'Manager' ? 'text-[#F2C4CE]' : actor.role === 'Staff' ? 'text-[#78DC8C]' : 'text-gray-500'}`}>{actor.role}</div>
                      </td>
                      <td className="p-4 font-bold">{o.product?.name || "N/A"}</td>
                      <td className="p-4 text-gray-400">{o.orderType}</td>
                      <td className="p-4 text-[#F2C4CE] font-bold">{o.warehouse}</td>
                      <td className="p-4 text-right">
                        {o.status === 'Delivered' ? (
                          <span className="inline-flex items-center rounded-full border border-green-400/30 bg-green-400/10 px-3 py-1 text-[#78DC8C] text-[9px] uppercase font-bold">Completed</span>
                        ) : o.status === 'Cancelled' ? (
                          <span className="inline-flex items-center rounded-full border border-red-400/30 bg-red-400/10 px-3 py-1 text-red-300 text-[9px] uppercase font-bold">Cancelled</span>
                        ) : !canManageOrders ? (
                          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-gray-400 text-[9px] uppercase font-bold">{o.status}</span>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <button onClick={() => handleDeliver(o._id, o.orderType)} className="rounded-full border border-[#F2C4CE]/40 bg-[#F2C4CE]/10 px-3 py-1 text-[9px] uppercase font-bold text-[#F2C4CE] hover:bg-[#F2C4CE]/20 hover:text-white transition">Deliver</button>
                            <button onClick={() => handleCancelOrder(o._id)} className="rounded-full border border-red-400/40 bg-red-400/10 px-3 py-1 text-[9px] uppercase font-bold text-red-300 hover:bg-red-400/20 hover:text-white transition">Cancel</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'suppliers' && (
            <div className="space-y-8">
              {supplierSubTab === 'network' && (
                <div className="bg-[#36353A]/40 border border-[#5A595E] rounded-xl overflow-hidden shadow-2xl">
                  <div className="p-4 bg-[#232226] border-b border-[#5A595E] flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-[#F2C4CE] tracking-widest">Supply Network</span>
                    {user.role === 'SuperAdmin' && <button onClick={() => { resetSupplierForm(); setShowSupplierModal(true); }} className="text-[9px] border border-[#F58F7C] text-[#F58F7C] px-3 py-1 rounded font-bold uppercase hover:bg-[#F58F7C]/10 transition">Add Supplier</button>}
                  </div>
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-black/20 text-gray-500 uppercase">
                      <tr><th className="p-4">Supplier</th><th className="p-4">Contact</th><th className="p-4">Email</th><th className="p-4">Address</th><th className="p-4 text-right">Action</th></tr>
                    </thead>
                    <tbody>
                      {suppliers.map(s => (
                        <tr key={s._id} className="border-b border-white/5 hover:bg-white/5">
                          <td className="p-4 font-bold">{s.name}</td>
                          <td className="p-4 text-gray-400">{s.contactPerson}</td>
                          <td className="p-4">{s.email}</td>
                          <td className="p-4 text-gray-500 text-[10px]">{s.address}</td>
                          <td className="p-4 text-right">
                            {user.role === 'SuperAdmin' && (
                              <div className="flex justify-end gap-3">
                                <button onClick={() => startEditingSupplier(s)} className="text-[#F2C4CE] hover:text-white font-bold uppercase underline text-[9px] transition-colors">Edit</button>
                                <button onClick={() => handleDeleteSupplier(s._id)} className="text-[#F58F7C] hover:text-red-400 font-bold uppercase underline text-[9px] transition-colors">Remove</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {supplierSubTab === 'warehouses' && (
                <div className="bg-[#36353A]/40 border border-[#5A595E] rounded-xl overflow-hidden shadow-2xl">
                  <div className="p-4 bg-[#232226] border-b border-[#5A595E] flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-[#F58F7C] tracking-widest">Warehouse Directory</span>
                    {user.role === 'SuperAdmin' && <button onClick={() => { resetWarehouseForm(); setShowWarehouseModal(true); }} className="text-[9px] border border-[#F58F7C] text-[#F58F7C] px-3 py-1 rounded font-bold uppercase hover:bg-[#F58F7C]/10 transition">Add Warehouse</button>}
                  </div>
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-black/20 text-gray-500 uppercase">
                      <tr><th className="p-4">Warehouse</th><th className="p-4">Address</th><th className="p-4 text-right">Action</th></tr>
                    </thead>
                    <tbody>
                      {warehouses.map(warehouse => (
                        <tr key={warehouse._id} className="border-b border-white/5 hover:bg-white/5">
                          <td className="p-4 font-bold">{warehouse.name}</td>
                          <td className="p-4 text-gray-400">{warehouse.address || 'No address provided'}</td>
                          <td className="p-4 text-right">
                            {user.role === 'SuperAdmin' && (
                              <div className="flex justify-end gap-3">
                                <button onClick={() => startEditingWarehouse(warehouse)} className="text-[#F2C4CE] hover:text-white font-bold uppercase underline text-[9px] transition-colors">Edit</button>
                                <button onClick={() => handleDeleteWarehouse(warehouse._id)} className="text-[#F58F7C] hover:text-red-400 font-bold uppercase underline text-[9px] transition-colors">Remove</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
                <div className="p-6 bg-[#36353A]/40 border border-[#5A595E] rounded-2xl min-w-0">
                  <p className="text-[10px] text-gray-500 uppercase font-bold mb-2">Total Inventory Value</p>
                  <p className="text-3xl font-bold text-[#78DC8C]">₱{totalValue.toLocaleString()}</p>
                </div>
                <div className="p-6 bg-[#36353A]/40 border border-[#F2C4CE]/20 rounded-2xl min-w-0">
                  <p className="text-[10px] text-gray-500 uppercase font-bold mb-2">Critical Stock Alerts</p>
                  <p className="text-3xl font-bold text-[#F2C4CE]">{lowStockCount}</p>
                </div>
              
                {warehouseNames.map((warehouseName) => (
                  <div key={warehouseName} className="p-6 bg-[#36353A]/40 border border-[#5A595E] rounded-2xl min-w-0">
                    <p className="text-[10px] text-gray-500 uppercase font-bold mb-2">{warehouseName} Total Stock</p>
                    <p className="text-3xl font-bold text-white">{(warehouseTotals[warehouseName] || 0).toLocaleString()} units</p>
                  </div>
                ))}
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

              {['Manager', 'SuperAdmin'].includes(user.role) && (
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

          {activeTab === 'users' && ['Manager', 'SuperAdmin'].includes(user.role) && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1 bg-[#36353A]/40 border border-[#5A595E] p-8 rounded-2xl shadow-xl h-fit">
                <h3 className="text-sm font-bold text-[#F2C4CE] uppercase mb-6 tracking-widest">{editingUserId ? 'Edit Personnel' : 'Register Personnel'}</h3>
                <form onSubmit={handleRegisterStaff} className="space-y-4" autoComplete="off">
                  <input type="text" name="username" autoComplete="username" tabIndex={-1} className="hidden" />
                  <input type="password" name="password" autoComplete="current-password" tabIndex={-1} className="hidden" />
                  <div><label className="text-[10px] text-gray-500 uppercase font-bold">Full Name</label><input type="text" name="personnel_name" autoComplete="section-personnel off" value={newStaff.name} onChange={(e) => setNewStaff({...newStaff, name: e.target.value})} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs text-white" required /></div>
                  <div><label className="text-[10px] text-gray-500 uppercase font-bold">Email</label><input type="email" name="personnel_email" autoComplete="section-personnel new-email" value={newStaff.email} onChange={(e) => setNewStaff({...newStaff, email: e.target.value})} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs text-white" required /></div>
                  <div><label className="text-[10px] text-gray-500 uppercase font-bold">Password</label><input type="password" name="personnel_password" autoComplete="new-password" value={newStaff.password} onChange={(e) => setNewStaff({...newStaff, password: e.target.value})} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs text-white" required={!editingUserId} placeholder={editingUserId ? 'Enter new password' : ''} /></div>
                  <div><label className="text-[10px] text-gray-500 uppercase font-bold">Role</label>{user.role === 'SuperAdmin' && !editingUserId ? <select value={newStaff.role} onChange={(e) => setNewStaff({...newStaff, role: e.target.value})} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs text-white"><option value="Staff">Staff</option><option value="Manager">Manager</option></select> : <input type="text" value={newStaff.role || 'Staff'} readOnly className="w-full bg-[#232226] border border-[#5A595E] p-3 rounded text-xs text-gray-400" />}</div>
                  <div className="flex gap-3">
                    <button type="submit" className="flex-1 bg-[#F2C4CE] text-[#2C2B30] py-4 rounded font-bold uppercase text-[10px] tracking-widest shadow-lg hover:brightness-110 transition-all">{editingUserId ? 'Save Changes' : 'Authorize Access'}</button>
                    {editingUserId && <button type="button" onClick={resetPersonnelForm} className="px-5 border border-[#5A595E] text-gray-400 rounded font-bold uppercase text-[10px] tracking-widest hover:bg-white/5 transition-all">Cancel</button>}
                  </div>
                </form>
              </div>
              <div className="lg:col-span-2 bg-[#36353A]/40 border border-[#5A595E] rounded-2xl overflow-hidden shadow-2xl">
                <div className="p-4 bg-[#232226] border-b border-[#5A595E] text-[10px] font-bold uppercase tracking-widest text-[#F2C4CE]">Authorized Personnel</div>
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-black/20 text-gray-500 uppercase border-b border-[#5A595E]">
                    <tr><th className="p-4">Name</th><th className="p-4">Email</th><th className="p-4">Role</th><th className="p-4 text-right">Action</th></tr>
                  </thead>
                  <tbody>
                    {sortedUsers.map(u => (
                      <tr key={u._id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="p-4 font-bold">{u.name}</td>
                        <td className="p-4 text-gray-400">{u.email}</td>
                        <td className="p-4"><span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${u.role === 'SuperAdmin' ? 'bg-[#F58F7C]/20 text-[#F58F7C]' : u.role === 'Manager' ? 'bg-[#F2C4CE]/20 text-[#F2C4CE]' : 'bg-white/10 text-gray-400'}`}>{u.role.toUpperCase()}</span></td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-3">
                            {canEditUser(u) && <button onClick={() => startEditingUser(u)} className="text-[#F2C4CE] hover:text-white font-bold uppercase underline text-[9px] transition-colors">Edit</button>}
                            {user.role === 'SuperAdmin' && u._id !== user._id && u.role !== 'SuperAdmin' && <button onClick={() => handleDeactivateUser(u._id)} className="text-[#F58F7C] hover:text-red-400 font-bold uppercase underline text-[9px] transition-colors">Revoke</button>}
                          </div>
                        </td>
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
            <div className="space-y-1"><label className="text-[10px] text-gray-500 uppercase font-bold">Product</label><select className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs text-white" onChange={(e) => {
              const productId = e.target.value;
              const selectedProduct = products.find((product) => product._id === productId);
              setNewOrder({
                ...newOrder,
                product: productId,
                supplier: selectedProduct?.supplier?._id || selectedProduct?.supplier || '',
              });
            }} required value={newOrder.product}><option value="">-- Choose Product --</option>{products.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}</select></div>
            <div className="space-y-1"><label className="text-[10px] text-gray-500 uppercase font-bold">Supplier</label><input type="text" readOnly value={selectedOrderSupplierName || 'Registered supplier will appear here'} className="w-full cursor-not-allowed bg-[#232226] border border-[#5A595E] p-3 rounded text-xs text-gray-300" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><label className="text-[10px] text-gray-500 uppercase font-bold">Quantity</label><input type="number" min="0" className="no-number-spinner w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs text-white outline-none" onChange={(e) => setNewOrder({...newOrder, quantity: Math.max(0, Number(e.target.value) || 0)})} required value={newOrder.quantity || ''} /></div>
              <div className="space-y-1"><label className="text-[10px] text-gray-500 uppercase font-bold">Target Hub</label><select className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs text-white" onChange={(e) => setNewOrder({...newOrder, warehouse: e.target.value})} value={newOrder.warehouse}>{warehouses.map((warehouse) => <option key={warehouse._id} value={warehouse.name}>{warehouse.name}</option>)}</select></div>
            </div>
            <div className="flex gap-4 pt-4"><button type="submit" className="flex-1 bg-[#F2C4CE] text-[#2C2B30] font-bold py-4 rounded text-xs uppercase shadow-lg hover:brightness-110">Authorize</button><button type="button" onClick={() => { resetOrderForm(); setShowOrderModal(false); }} className="flex-1 border border-[#5A595E] text-gray-400 font-bold py-4 rounded text-xs uppercase hover:bg-white/5 transition">Cancel</button></div>
          </form>
        </div>
      )}
      {showProductModal && user.role === 'SuperAdmin' && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <form onSubmit={handleCreateProduct} className="bg-[#36353A] border border-[#5A595E] p-8 rounded-2xl w-full max-w-2xl space-y-5 shadow-2xl">
            <h3 className="text-sm font-bold text-[#F58F7C] uppercase tracking-widest border-b border-white/10 pb-4">Register Product</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1"><label className="text-[10px] text-gray-500 uppercase font-bold">Product Name</label><input type="text" value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs text-white" required /></div>
              <div className="space-y-1"><label className="text-[10px] text-gray-500 uppercase font-bold">Product Code (SKU)</label><input type="text" value={newProduct.sku} onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs text-white" required /></div>
              <div className="space-y-1 relative">
                <label className="text-[10px] text-gray-500 uppercase font-bold">Category</label>
                <input
                  type="text"
                  value={newProduct.category}
                  onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                  onFocus={() => setShowCategorySuggestions(true)}
                  onBlur={() => setTimeout(() => setShowCategorySuggestions(false), 120)}
                  className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs text-white"
                  required
                />
                {showCategorySuggestions && filteredCategorySuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-2 z-20 overflow-hidden rounded-xl border border-[#5A595E] bg-[#2A292D] shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                    <div className="max-h-44 overflow-y-auto custom-scrollbar py-2">
                      {filteredCategorySuggestions.map((category) => (
                        <button
                          key={category}
                          type="button"
                          onMouseDown={() => {
                            setNewProduct({ ...newProduct, category });
                            setShowCategorySuggestions(false);
                          }}
                          className="flex w-full items-center justify-between px-4 py-3 text-left text-xs text-gray-200 transition hover:bg-[#F2C4CE]/10 hover:text-white"
                        >
                          <span>{category}</span>
                          <span className="text-[9px] uppercase tracking-widest text-gray-500">Existing</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-1"><label className="text-[10px] text-gray-500 uppercase font-bold">Supplier Name</label><select value={newProduct.supplier} onChange={(e) => setNewProduct({ ...newProduct, supplier: e.target.value })} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs text-white" required><option value="">Select supplier</option>{suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}</select></div>
              <div className="space-y-1"><label className="text-[10px] text-gray-500 uppercase font-bold">Unit Price</label><input type="number" min="0" value={newProduct.price} onChange={(e) => setNewProduct({ ...newProduct, price: Math.max(0, Number(e.target.value) || 0) })} className="no-number-spinner w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs text-white" required /></div>
              <div className="space-y-1"><label className="text-[10px] text-gray-500 uppercase font-bold">Low Stock Threshold</label><input type="number" min="0" value={newProduct.reorderThreshold} onChange={(e) => setNewProduct({ ...newProduct, reorderThreshold: Math.max(0, Number(e.target.value) || 0) })} className="no-number-spinner w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs text-white" required /></div>
            </div>
            <div className="flex gap-4 pt-4">
              <button type="submit" className="flex-1 bg-[#F58F7C] text-[#2C2B30] font-bold py-4 rounded text-xs uppercase shadow-lg hover:brightness-110">Create Product</button>
              <button type="button" onClick={() => { resetProductForm(); setShowProductModal(false); }} className="flex-1 border border-[#5A595E] text-gray-400 font-bold py-4 rounded text-xs uppercase hover:bg-white/5 transition">Cancel</button>
            </div>
          </form>
        </div>
      )}
      {showSupplierModal && user.role === 'SuperAdmin' && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <form onSubmit={handleSupplierSubmit} className="bg-[#36353A] border border-[#5A595E] p-8 rounded-2xl w-full max-w-2xl space-y-5 shadow-2xl">
            <h3 className="text-sm font-bold text-[#F2C4CE] uppercase tracking-widest border-b border-white/10 pb-4">{editingSupplierId ? 'Edit Supplier' : 'Register Supplier'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1"><label className="text-[10px] text-gray-500 uppercase font-bold">Supplier Name</label><input type="text" value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs text-white" required /></div>
              <div className="space-y-1"><label className="text-[10px] text-gray-500 uppercase font-bold">Contact Person</label><input type="text" value={supplierForm.contactPerson} onChange={(e) => setSupplierForm({ ...supplierForm, contactPerson: e.target.value })} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs text-white" /></div>
              <div className="space-y-1"><label className="text-[10px] text-gray-500 uppercase font-bold">Email Address</label><input type="email" value={supplierForm.email} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs text-white" required /></div>
              <div className="space-y-1"><label className="text-[10px] text-gray-500 uppercase font-bold">Phone Number</label><input type="text" value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs text-white" required /></div>
              <div className="space-y-1 md:col-span-2"><label className="text-[10px] text-gray-500 uppercase font-bold">Address</label><input type="text" value={supplierForm.address} onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs text-white" /></div>
              <div className="space-y-1"><label className="text-[10px] text-gray-500 uppercase font-bold">Lead Time (Days)</label><input type="number" min="0" value={supplierForm.leadTimeDays} onChange={(e) => setSupplierForm({ ...supplierForm, leadTimeDays: Math.max(0, Number(e.target.value) || 0) })} className="no-number-spinner w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs text-white" /></div>
            </div>
            <div className="flex gap-4 pt-4">
              <button type="submit" className="flex-1 bg-[#F2C4CE] text-[#2C2B30] font-bold py-4 rounded text-xs uppercase shadow-lg hover:brightness-110">{editingSupplierId ? 'Save Supplier' : 'Create Supplier'}</button>
              <button type="button" onClick={() => { resetSupplierForm(); setShowSupplierModal(false); }} className="flex-1 border border-[#5A595E] text-gray-400 font-bold py-4 rounded text-xs uppercase hover:bg-white/5 transition">Cancel</button>
            </div>
          </form>
        </div>
      )}
      {showWarehouseModal && user.role === 'SuperAdmin' && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <form onSubmit={handleWarehouseSubmit} className="bg-[#36353A] border border-[#5A595E] p-8 rounded-2xl w-full max-w-xl space-y-5 shadow-2xl">
            <h3 className="text-sm font-bold text-[#F58F7C] uppercase tracking-widest border-b border-white/10 pb-4">{editingWarehouseId ? 'Edit Warehouse' : 'Register Warehouse'}</h3>
            <div className="space-y-4">
              <div className="space-y-1"><label className="text-[10px] text-gray-500 uppercase font-bold">Warehouse Name</label><input type="text" value={warehouseForm.name} onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs text-white" required /></div>
              <div className="space-y-1"><label className="text-[10px] text-gray-500 uppercase font-bold">Address</label><input type="text" value={warehouseForm.address} onChange={(e) => setWarehouseForm({ ...warehouseForm, address: e.target.value })} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-xs text-white" /></div>
            </div>
            <div className="flex gap-4 pt-4">
              <button type="submit" className="flex-1 bg-[#F58F7C] text-[#2C2B30] font-bold py-4 rounded text-xs uppercase shadow-lg hover:brightness-110">{editingWarehouseId ? 'Save Warehouse' : 'Create Warehouse'}</button>
              <button type="button" onClick={() => { resetWarehouseForm(); setShowWarehouseModal(false); }} className="flex-1 border border-[#5A595E] text-gray-400 font-bold py-4 rounded text-xs uppercase hover:bg-white/5 transition">Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;
