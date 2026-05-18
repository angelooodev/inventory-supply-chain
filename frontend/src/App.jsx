import { useState, useEffect, useRef } from 'react';
import { fetchProducts, fetchOrders, fetchSuppliers, createOrder, createProduct, importProducts, downloadProductImportTemplate, updateOrderStatus, updateOrderAccounting, createSupplier, updateSupplier, updateProduct, deleteProduct, deleteSupplier, fetchWarehouses, createWarehouse, updateWarehouse, deleteWarehouse, fetchPurchaseOrderForOrder, signPurchaseOrder, fetchTransferOrderForOrder, signTransferOrder, createOrUpdateSupplierAccount, fetchOwnSupplierProfile, updateOwnSupplierPaymentMethods } from './api/inventory';
import Login from './components/Login';
import SignaturePadField from './components/SignaturePadField';
import SupplierSignPage from './components/SupplierSignPage';
import gcashLogo from './assets/payments/gcash.png';
import mayaLogo from './assets/payments/maya.png';
import cardBrandsLogo from './assets/payments/card-brands.png';
import { Menu, X, Download, ShieldCheck, Users, Package, Truck, LayoutDashboard, CreditCard, Landmark } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
const API_ORIGIN = API_BASE.replace(/\/api$/, '');
const getActiveTabStorageKey = (userId) => `lumiere_active_tab_${userId}`;
const getSupplierSubTabStorageKey = (userId) => `lumiere_supplier_subtab_${userId}`;
const getExpenseSubTabStorageKey = (userId) => `lumiere_expense_subtab_${userId}`;
const pageHeaderSpacerClass = 'min-h-[44px] flex items-center';
const unitOfMeasureOptions = ['pcs', 'box', 'pack', 'carton', 'bundle', 'set', 'dozen', 'kg', 'g', 'mg', 'L', 'mL', 'meter', 'cm', 'inch', 'foot', 'roll', 'tray', 'sack', 'bottle', 'can', 'jar', 'tube', 'ream', 'pair', 'unit'];
const WAREHOUSE_A_NAME = 'Warehouse A';
const supplierPayoutOptions = {
  bank_account: [
    { code: 'BPI', label: 'BPI' },
    { code: 'BDO', label: 'BDO' },
    { code: 'METROBANK', label: 'Metrobank' },
    { code: 'UNIONBANK', label: 'UnionBank' },
    { code: 'LANDBANK', label: 'LandBank' },
    { code: 'PNB', label: 'PNB' },
    { code: 'RCBC', label: 'RCBC' },
    { code: 'SECURITY_BANK', label: 'Security Bank' },
    { code: 'CHINABANK', label: 'Chinabank' },
  ],
  ewallet: [
    { code: 'GCASH', label: 'GCash' },
    { code: 'MAYA', label: 'Maya' },
  ],
};
const createEmptySupplierPaymentMethod = () => ({
  methodType: 'bank_account',
  providerCode: 'BPI',
  methodName: 'BPI',
  accountName: '',
  accountNumber: '',
  notes: '',
  isPrimary: false,
});
const getSupplierPaymentProviderLabel = (methodType, providerCode) => (
  supplierPayoutOptions[methodType]?.find((option) => option.code === providerCode)?.label || providerCode || ''
);
const normalizeSupplierPaymentMethodForForm = (method = {}) => {
  const legacyName = String(method.methodName || '').trim();
  const normalizedLegacy = legacyName.toUpperCase();
  const legacyLooksLikeWallet = normalizedLegacy.includes('GCASH') || normalizedLegacy.includes('MAYA');
  const fallbackMethodType = method.methodType || (legacyLooksLikeWallet ? 'ewallet' : 'bank_account');
  const providerCode = method.providerCode
    || (normalizedLegacy.includes('GCASH') ? 'GCASH'
      : normalizedLegacy.includes('MAYA') ? 'MAYA'
      : supplierPayoutOptions[fallbackMethodType]?.find((option) => normalizedLegacy.includes(option.code.replace('_', ' ')))?.code
      || supplierPayoutOptions[fallbackMethodType]?.[0]?.code
      || '');
  const normalizedProviderCode = String(providerCode || '').trim().toUpperCase();
  const inferredMethodType = ['GCASH', 'MAYA', 'PAYMAYA'].includes(normalizedProviderCode)
    ? 'ewallet'
    : fallbackMethodType;

  return {
    methodType: inferredMethodType,
    providerCode,
    methodName: legacyName || getSupplierPaymentProviderLabel(inferredMethodType, providerCode),
    accountName: String(method.accountName || '').trim(),
    accountNumber: String(method.accountNumber || '').trim(),
    notes: String(method.notes || '').trim(),
    isPrimary: Boolean(method.isPrimary),
  };
};
const normalizeSkuValue = (value) => String(value || '').trim().toUpperCase();
const formatSupplierNames = (productSuppliers = []) => {
  if (!Array.isArray(productSuppliers) || productSuppliers.length === 0) {
    return 'No suppliers linked';
  }

  return productSuppliers.map((supplier) => supplier?.name || '').filter(Boolean).join(', ') || 'No suppliers linked';
};
const getProductSupplierPricing = (product) => {
  if (!product || !Array.isArray(product.supplierPricing)) return [];

  return product.supplierPricing
    .map((entry) => {
      const supplierData = entry?.supplier;
      const supplierId = supplierData?._id || supplierData || '';
      if (!supplierId) return null;

      return {
        supplierId,
        supplier: supplierData && typeof supplierData === 'object'
          ? supplierData
          : product.suppliers?.find((linkedSupplier) => (linkedSupplier?._id || linkedSupplier) === supplierId) || null,
        cost: Number(entry?.cost || 0),
        updatedAt: entry?.updatedAt || '',
      };
    })
    .filter(Boolean);
};

const getSupplierCostEntry = (product, supplierId) => (
  getProductSupplierPricing(product).find((entry) => entry.supplierId === supplierId) || null
);
const getPrimarySupplierPaymentMethod = (supplier) => {
  const methods = Array.isArray(supplier?.paymentMethods) ? supplier.paymentMethods : [];
  if (!methods.length) return null;
  return methods.find((method) => method?.isPrimary) || methods[0];
};
const mapSupplierPrimaryPaymentMethodToCheckoutOption = (supplier) => {
  const primaryMethod = getPrimarySupplierPaymentMethod(supplier);
  if (!primaryMethod) {
    return {
      id: 'card',
      label: 'Credit or Debit Card',
      description: 'No supplier primary payment method is saved, so card checkout will be used.',
    };
  }

  const providerCode = String(primaryMethod.providerCode || '').trim().toUpperCase();
  const normalizedMethodType = String(primaryMethod.methodType || '').trim().toLowerCase();
  const isWalletProvider = ['GCASH', 'MAYA', 'PAYMAYA'].includes(providerCode);

  if (isWalletProvider || normalizedMethodType === 'ewallet') {
    if (providerCode === 'GCASH') {
      return {
        id: 'gcash',
        label: 'GCash',
        description: 'This supplier uses GCash as the primary payment method.',
      };
    }

    return {
      id: 'maya',
      label: 'Maya',
      description: 'This supplier uses Maya as the primary payment method.',
    };
  }

  if (normalizedMethodType === 'bank_account') {
    return {
      id: 'bank_account',
      label: primaryMethod.methodName ? `Bank Account - ${primaryMethod.methodName}` : 'Bank Account',
      description: 'This supplier uses a bank account as the primary payment method.',
    };
  }

  return {
    id: 'card',
    label: 'Credit or Debit Card',
    description: 'Card checkout will be used for this supplier payment.',
  };
};
const getSupplierDisbursementPaymentOption = (supplier) => {
  const primaryMethod = getPrimarySupplierPaymentMethod(supplier);
  const checkoutOption = mapSupplierPrimaryPaymentMethodToCheckoutOption(supplier);
  const providerLabel = String(primaryMethod?.methodName || checkoutOption.label || '').trim();
  const accountName = String(primaryMethod?.accountName || '').trim();
  const accountNumber = String(primaryMethod?.accountNumber || '').trim();
  const maskedAccountNumber = accountNumber ? `****${accountNumber.slice(-4)}` : '';

  if (checkoutOption.id === 'gcash') {
    return {
      ...checkoutOption,
      logo: 'gcash',
      accentClass: 'border-[#F2C4CE]/45 bg-[#F2C4CE]/10',
      iconClass: 'bg-[#1F2430]',
      detail: accountName && maskedAccountNumber
        ? `${accountName} • ${maskedAccountNumber}`
        : accountName || maskedAccountNumber || 'Supplier GCash account',
    };
  }

  if (checkoutOption.id === 'maya') {
    return {
      ...checkoutOption,
      logo: 'maya',
      accentClass: 'border-[#F5A28F]/45 bg-[#F5A28F]/10',
      iconClass: 'bg-[#1F2430]',
      detail: accountName && maskedAccountNumber
        ? `${accountName} • ${maskedAccountNumber}`
        : accountName || maskedAccountNumber || 'Supplier Maya account',
    };
  }

  if (checkoutOption.id === 'bank_account') {
    return {
      ...checkoutOption,
      logo: '',
      icon: Landmark,
      accentClass: 'border-[#B9A7FF]/30 bg-white/5',
      iconClass: 'bg-white/10 text-white',
      detail: [providerLabel, accountName, maskedAccountNumber].filter(Boolean).join(' • ') || 'Supplier bank payout account',
    };
  }

  return {
    ...checkoutOption,
    logo: 'card',
    icon: CreditCard,
    accentClass: 'border-[#F2C4CE] bg-[#F2C4CE]/10',
    iconClass: 'bg-[#1F2430]',
    detail: checkoutOption.description,
  };
};

const getCheapestSupplierQuote = (product) => (
  getProductSupplierPricing(product).reduce((lowestEntry, entry) => {
    if (!lowestEntry || entry.cost < lowestEntry.cost) {
      return entry;
    }

    return lowestEntry;
  }, null)
);

const getOrderSupplierUnitPrice = (order) => {
  if (!order || order.orderType !== 'Inbound') return 0;
  const snapshotPrice = Number(order.supplierUnitPrice);
  if (Number.isFinite(snapshotPrice) && snapshotPrice > 0) {
    return snapshotPrice;
  }

  const supplierId = String(order.supplier?._id || order.supplier || '');
  if (!supplierId || !order.product) return 0;

  const currentSupplierCost = Number(getSupplierCostEntry(order.product, supplierId)?.cost || 0);
  if (Number.isFinite(currentSupplierCost) && currentSupplierCost > 0) {
    return currentSupplierCost;
  }

  return 0;
};

const getOrderExpenseAmount = (order) => {
  if (!order || order.orderType !== 'Inbound') return 0;
  const snapshotAmount = Number(order.expenseAmount);
  if (Number.isFinite(snapshotAmount) && snapshotAmount > 0) {
    return snapshotAmount;
  }

  return getOrderSupplierUnitPrice(order) * Number(order.quantity || 0);
};
const getOrderCustomerUnitPrice = (order) => {
  if (!order || order.orderType !== 'Outbound') return 0;
  const snapshotPrice = Number(order.customerUnitPrice);
  if (Number.isFinite(snapshotPrice) && snapshotPrice >= 0) {
    return snapshotPrice;
  }

  return Number(order.product?.price || 0);
};

const getOrderReceivableAmount = (order) => {
  if (!order || order.orderType !== 'Outbound') return 0;
  const snapshotAmount = Number(order.receivableAmount);
  if (Number.isFinite(snapshotAmount) && snapshotAmount >= 0) {
    return snapshotAmount;
  }

  return getOrderCustomerUnitPrice(order) * Number(order.quantity || 0);
};
const getOrderAccountingPaymentMethodSummary = (order) => {
  const fallbackMethod = getPrimarySupplierPaymentMethod(order?.supplier);
  const methodName = String(order?.accountingPaymentMethodName || fallbackMethod?.methodName || '').trim();
  const provider = String(order?.accountingPaymentMethodProvider || fallbackMethod?.providerCode || '').trim();
  const accountName = String(order?.accountingPaymentMethodAccountName || fallbackMethod?.accountName || '').trim();
  const maskedNumber = String(order?.accountingPaymentMethodAccountNumberMasked || '').trim()
    || (fallbackMethod?.accountNumber ? `****${String(fallbackMethod.accountNumber).slice(-4)}` : '');

  const left = methodName || provider || '';
  const rightParts = [accountName, maskedNumber].filter(Boolean);

  if (!left && !rightParts.length) return 'No payment method saved';
  if (!rightParts.length) return left;
  if (!left) return rightParts.join(' • ');
  return `${left} • ${rightParts.join(' • ')}`;
};
const getOrderAccountingStatusTone = (order) => {
  if (order.accountingSettlementStatus === 'Settled') return 'success';
  if (order.accountingSettlementStatus === 'Failed') return 'danger';
  if (order.accountingSettlementStatus === 'InProgress') return 'warning';
  return 'default';
};

const orderNeedsSupplierQuoteForDisbursement = (order) => (
  order?.orderType === 'Inbound'
  && ['DISBURSE', 'RETRY_DISBURSEMENT'].includes(order?.accountingAction)
  && Number(order?.expenseAmount || 0) <= 0
);

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
  const supplierSignToken = typeof window !== 'undefined'
    ? window.location.pathname.match(/^\/supplier-sign\/([^/]+)/)?.[1] || null
    : null;
  const defaultOrderForm = {
    product: '',
    supplier: '',
    quantity: 0,
    warehouse: '',
    sourceWarehouse: '',
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
  const [showDeleteProductModal, setShowDeleteProductModal] = useState(false);
  const [editingProductId, setEditingProductId] = useState(null);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [showPurchaseOrderModal, setShowPurchaseOrderModal] = useState(false);
  const [showTransferOrderModal, setShowTransferOrderModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [successMessage, setSuccessMessage] = useState(''); 
  const [errorMessage, setErrorMessage] = useState('');
  const [purchaseOrderRecord, setPurchaseOrderRecord] = useState(null);
  const [transferOrderRecord, setTransferOrderRecord] = useState(null);
  const [purchaseOrderLoading, setPurchaseOrderLoading] = useState(false);
  const [purchaseOrderSubmitting, setPurchaseOrderSubmitting] = useState(false);
  const [transferOrderLoading, setTransferOrderLoading] = useState(false);
  const [transferOrderSubmitting, setTransferOrderSubmitting] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationsPanelRef = useRef(null);
  const notificationsButtonRef = useRef(null);
  const productCodeInputRef = useRef(null);
  const productImportInputRef = useRef(null);
  const barcodeScanBufferRef = useRef('');
  const barcodeScanLastInputAtRef = useRef(0);
  const barcodeScanActiveRef = useRef(false);
  const barcodeScanTimeoutRef = useRef(null);
  const previousUserIdRef = useRef(user?._id ?? null);
  const accountingReturnProcessingRef = useRef(false);
  const handledAccountingReturnRef = useRef('');
  const [selectedInventoryProductId, setSelectedInventoryProductId] = useState(null);
  const [productPendingDelete, setProductPendingDelete] = useState(null);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); 
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [supplierSubTab, setSupplierSubTab] = useState(() => {
    const storedUser = JSON.parse(localStorage.getItem('lumiere_user'));
    if (!storedUser?._id) return 'network';
    return localStorage.getItem(getSupplierSubTabStorageKey(storedUser._id)) || 'network';
  });
  const [expenseSubTab, setExpenseSubTab] = useState(() => {
    const storedUser = JSON.parse(localStorage.getItem('lumiere_user'));
    if (!storedUser?._id) return 'payables';
    return localStorage.getItem(getExpenseSubTabStorageKey(storedUser._id)) || 'payables';
  });
  const [expenseViewMode, setExpenseViewMode] = useState('current');
  const [logDateFilter, setLogDateFilter] = useState('');
  const [logRequesterFilter, setLogRequesterFilter] = useState('');
  const [logProductFilter, setLogProductFilter] = useState('');
  const [logTypeFilter, setLogTypeFilter] = useState('All');
  const [logWarehouseFilter, setLogWarehouseFilter] = useState('');
  const [logStatusFilter, setLogStatusFilter] = useState('All');
  const [logActionFilter, setLogActionFilter] = useState('All');

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
    price: '',
    reorderThreshold: 10,
    unitOfMeasure: 'unit',
  });
  const [showCategorySuggestions, setShowCategorySuggestions] = useState(false);
  const [showUnitOfMeasureMenu, setShowUnitOfMeasureMenu] = useState(false);
  const [productImportSubmitting, setProductImportSubmitting] = useState(false);
  const [productTemplateDownloading, setProductTemplateDownloading] = useState(false);
  const [selectedSupplyNetworkProductId, setSelectedSupplyNetworkProductId] = useState('');
  const [productSupplierUpdateId, setProductSupplierUpdateId] = useState('');
  const [productSupplierCostDrafts, setProductSupplierCostDrafts] = useState({});
  const [productSupplierCostUpdateId, setProductSupplierCostUpdateId] = useState('');
  const [supplierOwnCostDrafts, setSupplierOwnCostDrafts] = useState({});
  const [supplierOwnCostUpdateId, setSupplierOwnCostUpdateId] = useState('');
  const [selectedSupplierProductId, setSelectedSupplierProductId] = useState(null);
  const [supplierForm, setSupplierForm] = useState({
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    leadTimeDays: 7,
    password: '',
  });
  const [warehouseForm, setWarehouseForm] = useState({
    name: '',
    address: '',
    manager: '',
  });
  const [supplierProfile, setSupplierProfile] = useState(null);
  const [activeSupplierSignToken, setActiveSupplierSignToken] = useState(supplierSignToken || null);
  const [activeSupplierPurchaseOrderRecord, setActiveSupplierPurchaseOrderRecord] = useState(null);
  const [supplierPaymentMethods, setSupplierPaymentMethods] = useState([]);
  const [supplierPasswordForm, setSupplierPasswordForm] = useState({ password: '', confirmPassword: '' });
  const [showSupplierPaymentMethodModal, setShowSupplierPaymentMethodModal] = useState(false);
  const [editingSupplierPaymentMethodIndex, setEditingSupplierPaymentMethodIndex] = useState(null);
  const [supplierPaymentMethodDraft, setSupplierPaymentMethodDraft] = useState(createEmptySupplierPaymentMethod());
  const [showDeleteSupplierPaymentMethodModal, setShowDeleteSupplierPaymentMethodModal] = useState(false);
  const [supplierPaymentMethodPendingDeleteIndex, setSupplierPaymentMethodPendingDeleteIndex] = useState(null);
  const [accountingActionTarget, setAccountingActionTarget] = useState(null);
  const [selectedAccountingPaymentMethod, setSelectedAccountingPaymentMethod] = useState('');
  const canManageOrders = ['Manager', 'SuperAdmin'].includes(user?.role);
  const canManageProducts = ['Manager', 'SuperAdmin'].includes(user?.role);
  const canViewExpenses = ['SuperAdmin', 'Accountant'].includes(user?.role);
  const currentSupplierId = String(supplierProfile?._id || user?.supplierId || user?.supplier || '');
  const getDefaultTransferTargetWarehouse = () => {
    if (user?.role === 'Manager') {
      return assignedWarehouseNames[0] || '';
    }

    return managedWarehouses[0]?.name || warehouses[0]?.name || '';
  };

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
        setExpenseSubTab('payables');
        setSupplierProfile(null);
        setSupplierPaymentMethods([]);
        setSupplierPaymentMethodDraft(createEmptySupplierPaymentMethod());
        setShowSupplierPaymentMethodModal(false);
        setEditingSupplierPaymentMethodIndex(null);
      return;
    }

    if (previousUserIdRef.current !== user._id) {
      previousUserIdRef.current = user._id;
      setActiveTab(localStorage.getItem(getActiveTabStorageKey(user._id)) || 'inventory');
      setSupplierSubTab(localStorage.getItem(getSupplierSubTabStorageKey(user._id)) || 'network');
      setExpenseSubTab(localStorage.getItem(getExpenseSubTabStorageKey(user._id)) || 'payables');
      setIsSidebarOpen(false);
      setSupplierProfile(null);
      setSupplierPaymentMethods([]);
      setSupplierPaymentMethodDraft(createEmptySupplierPaymentMethod());
      setShowSupplierPaymentMethodModal(false);
      setEditingSupplierPaymentMethodIndex(null);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    if (user.role === 'Supplier') {
      if (!['inventory', 'supplierProducts', 'orders', 'paymentMethods'].includes(activeTab)) {
        setActiveTab('inventory');
      }
      return;
    }

    if (user.role === 'Accountant') {
      if (!['inventory', 'orders', 'expenses'].includes(activeTab)) {
        setActiveTab('inventory');
      }
      return;
    }

    const canViewUsers = ['Manager', 'SuperAdmin'].includes(user.role);
    const canViewSuppliers = ['Manager', 'SuperAdmin'].includes(user.role);
    const canViewReports = ['Manager', 'SuperAdmin'].includes(user.role);
    const canViewExpensesTab = ['SuperAdmin', 'Accountant'].includes(user.role);

    if (
      (activeTab === 'users' && !canViewUsers) ||
      (activeTab === 'suppliers' && !canViewSuppliers) ||
      (activeTab === 'reports' && !canViewReports) ||
      (activeTab === 'expenses' && !canViewExpensesTab)
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
    if (!user?._id) return;
    localStorage.setItem(getExpenseSubTabStorageKey(user._id), expenseSubTab);
  }, [expenseSubTab, user]);

  useEffect(() => {
    if (!user || !orders.length || accountingReturnProcessingRef.current) return;

    const searchParams = new URLSearchParams(window.location.search);
    const accountingRef = String(searchParams.get('accountingRef') || '').trim();
    const accountingState = String(searchParams.get('accountingState') || '').trim().toLowerCase();

    if (!accountingRef || !accountingState) return;

    const handledKey = `${accountingRef}:${accountingState}`;
    if (handledAccountingReturnRef.current === handledKey) return;

    const targetOrder = orders.find((order) => String(order?.accountingReferenceId || '').trim() === accountingRef);
    if (!targetOrder) return;

    handledAccountingReturnRef.current = handledKey;
    accountingReturnProcessingRef.current = true;

    const clearAccountingReturnParams = () => {
      const nextParams = new URLSearchParams(window.location.search);
      nextParams.delete('accountingRef');
      nextParams.delete('accountingState');
      const nextQuery = nextParams.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash || ''}`;
      window.history.replaceState({}, '', nextUrl);
    };

    const syncAccountingReturn = async () => {
      setActiveTab('expenses');
      setExpenseSubTab('payables');
      setExpenseViewMode('current');

      try {
        const refreshedOrder = await updateOrderAccounting(targetOrder._id, 'REFRESH_DISBURSEMENT');
        const methodSummary = getOrderAccountingPaymentMethodSummary(refreshedOrder);

        if (refreshedOrder.accountingSettlementStatus === 'Settled') {
          triggerSuccess(`Disbursement completed via ${methodSummary}.`);
        } else if (accountingState === 'failure' || refreshedOrder.accountingSettlementStatus === 'Failed') {
          triggerError(refreshedOrder.accountingFailureReason || 'Disbursement was not completed.');
        } else {
          triggerSuccess(`Disbursement status updated. Xendit status: ${refreshedOrder.accountingExternalStatus || 'PENDING'}.`);
        }

        await loadData();
      } catch (error) {
        triggerError(error.message || 'Unable to refresh the disbursement status.');
      } finally {
        clearAccountingReturnParams();
        accountingReturnProcessingRef.current = false;
      }
    };

    syncAccountingReturn();
  }, [orders, user]);

  useEffect(() => {
    setExpenseViewMode('current');
  }, [expenseSubTab]);

  useEffect(() => {
    if (!products.length) {
      setSelectedSupplyNetworkProductId('');
      return;
    }

    setSelectedSupplyNetworkProductId((current) => (
      current && products.some((product) => product._id === current) ? current : products[0]._id
    ));
  }, [products]);

  useEffect(() => {
    const targetProduct = products.find((product) => product._id === selectedSupplyNetworkProductId) || products[0] || null;

    if (!targetProduct) {
      setProductSupplierCostDrafts({});
      return;
    }

    const nextDrafts = {};
    getProductSupplierPricing(targetProduct).forEach((entry) => {
      nextDrafts[entry.supplierId] = String(entry.cost);
    });
    setProductSupplierCostDrafts((currentDrafts) => {
      const nextMergedDrafts = { ...currentDrafts };
      const linkedIds = new Set((targetProduct.suppliers || []).map((supplier) => supplier?._id || supplier).filter(Boolean));

      Object.keys(nextMergedDrafts).forEach((supplierId) => {
        if (!linkedIds.has(supplierId)) {
          delete nextMergedDrafts[supplierId];
        }
      });

      linkedIds.forEach((supplierId) => {
        if (Object.prototype.hasOwnProperty.call(nextDrafts, supplierId)) {
          nextMergedDrafts[supplierId] = nextDrafts[supplierId];
        } else if (!Object.prototype.hasOwnProperty.call(nextMergedDrafts, supplierId)) {
          nextMergedDrafts[supplierId] = '';
        }
      });

      return nextMergedDrafts;
    });
  }, [products, selectedSupplyNetworkProductId]);

  useEffect(() => {
    if (user?.role !== 'Supplier' || !currentSupplierId) {
      setSupplierOwnCostDrafts({});
      return;
    }

    const nextDrafts = {};
    products.forEach((product) => {
      const supplierCostEntry = getSupplierCostEntry(product, currentSupplierId);
      nextDrafts[product._id] = supplierCostEntry ? String(supplierCostEntry.cost) : '';
    });

    setSupplierOwnCostDrafts(nextDrafts);
  }, [products, user, currentSupplierId]);

  useEffect(() => {
    if (user?.role !== 'Supplier') {
      setSelectedSupplierProductId(null);
      return;
    }

    const nextSupplierProductCatalog = currentSupplierId
      ? [...products].sort((leftProduct, rightProduct) => {
          const leftLinked = (leftProduct.suppliers || []).some((supplier) => String(supplier?._id || supplier) === currentSupplierId);
          const rightLinked = (rightProduct.suppliers || []).some((supplier) => String(supplier?._id || supplier) === currentSupplierId);
          if (leftLinked !== rightLinked) return leftLinked ? -1 : 1;
          return leftProduct.name.localeCompare(rightProduct.name);
        })
      : [];

    if (!nextSupplierProductCatalog.length) {
      setSelectedSupplierProductId(null);
      return;
    }

    const selectedStillExists = nextSupplierProductCatalog.some((product) => product._id === selectedSupplierProductId);
    if (!selectedStillExists && selectedSupplierProductId) {
      setSelectedSupplierProductId(null);
    }
  }, [products, selectedSupplierProductId, user, currentSupplierId]);

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

  useEffect(() => {
    if (!filteredProducts.length) {
      setSelectedInventoryProductId(null);
      return;
    }

    const selectedStillVisible = filteredProducts.some((product) => product._id === selectedInventoryProductId);
    if (!selectedStillVisible) {
      setSelectedInventoryProductId(null);
    }
  }, [selectedInventoryProductId, products, searchTerm, selectedCategory, user, warehouses]);

  useEffect(() => {
    if (!showProductModal || !canManageProducts) return;

    const focusTimeout = setTimeout(() => {
      productCodeInputRef.current?.focus();
      const inputLength = productCodeInputRef.current?.value?.length || 0;
      productCodeInputRef.current?.setSelectionRange?.(inputLength, inputLength);
    }, 60);

    return () => clearTimeout(focusTimeout);
  }, [showProductModal, canManageProducts, newProduct.sku]);

  useEffect(() => {
    if (!user || !canManageProducts || supplierSignToken) return;

    const scannerGapMs = 45;
    const scannerResetMs = 90;
    const minimumEnterCommittedLength = 2;
    const minimumIdleCommittedLength = 6;
    const ignoredKeys = new Set(['Shift', 'Alt', 'Control', 'Meta', 'CapsLock', 'Tab']);

    const scheduleIdleCommit = () => {
      if (barcodeScanTimeoutRef.current) {
        clearTimeout(barcodeScanTimeoutRef.current);
      }

      barcodeScanTimeoutRef.current = setTimeout(() => {
        const bufferedValue = barcodeScanBufferRef.current;
        if (barcodeScanActiveRef.current && bufferedValue.length >= minimumIdleCommittedLength) {
          openProductModalForScannedSku(bufferedValue);
          return;
        }

        clearBarcodeScanState();
      }, scannerResetMs);
    };

    const handleGlobalScannerInput = (event) => {
      if (event.ctrlKey || event.altKey || event.metaKey || ignoredKeys.has(event.key)) {
        return;
      }

      const now = Date.now();

      if (event.key === 'Enter') {
        const bufferedValue = barcodeScanBufferRef.current;
        const timeSinceLastInput = now - barcodeScanLastInputAtRef.current;
        if (
          bufferedValue &&
          bufferedValue.length >= minimumEnterCommittedLength &&
          (barcodeScanActiveRef.current || timeSinceLastInput <= scannerGapMs)
        ) {
          event.preventDefault();
          openProductModalForScannedSku(bufferedValue);
          return;
        }

        clearBarcodeScanState();
        return;
      }

      if (event.key.length !== 1) {
        return;
      }

      const timeSinceLastInput = now - barcodeScanLastInputAtRef.current;
      if (!barcodeScanActiveRef.current && timeSinceLastInput > scannerGapMs) {
        barcodeScanBufferRef.current = '';
      }

      barcodeScanBufferRef.current += event.key;
      barcodeScanLastInputAtRef.current = now;

      if (barcodeScanBufferRef.current.length >= 2 && timeSinceLastInput <= scannerGapMs) {
        barcodeScanActiveRef.current = true;
      }

      scheduleIdleCommit();
    };

    window.addEventListener('keydown', handleGlobalScannerInput, true);

    return () => {
      window.removeEventListener('keydown', handleGlobalScannerInput, true);
      clearBarcodeScanState();
    };
  }, [user, canManageProducts, supplierSignToken]);

  const loadData = async () => {
    try {
      if (user?.role === 'Supplier') {
        setSupplierProfile(null);
        setSupplierPaymentMethods([]);
        const [pData, oData, supplierData] = await Promise.all([
          fetchProducts(),
          fetchOrders(),
          fetchOwnSupplierProfile(),
        ]);
        setProducts(pData || []);
        setOrders(oData || []);
        setSupplierProfile(supplierData || null);
        setSupplierPaymentMethods(
          supplierData?.paymentMethods?.length
            ? supplierData.paymentMethods.map(normalizeSupplierPaymentMethodForForm)
            : []
        );
        setSuppliers([]);
        setWarehouses([]);
        return;
      }

      const [pData, oData, sData, wData] = await Promise.all([
        fetchProducts(),
        fetchOrders(),
        fetchSuppliers(),
        fetchWarehouses(),
      ]);
      setProducts(pData || []);
      setOrders(oData || []);
      setSuppliers(sData || []);
      setWarehouses(wData || []);
      setSupplierProfile(null);
      setSupplierPaymentMethods([]);
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

  const closePurchaseOrderModal = () => {
    setShowPurchaseOrderModal(false);
    setPurchaseOrderRecord(null);
    setPurchaseOrderLoading(false);
    setPurchaseOrderSubmitting(false);
  };

  const closeTransferOrderModal = () => {
    setShowTransferOrderModal(false);
    setTransferOrderRecord(null);
    setTransferOrderLoading(false);
    setTransferOrderSubmitting(false);
  };

  const openPurchaseOrderModal = async (order) => {
    if (user?.role === 'Supplier') {
      const signingToken = order?.purchaseOrder?.supplierSigningToken;
      setActiveSupplierPurchaseOrderRecord(order?.purchaseOrder ? { ...order.purchaseOrder, order } : null);
      setActiveSupplierSignToken(signingToken || null);
      if (!order?.purchaseOrder) {
        triggerError('Purchase order is not available for this supplier record.');
      }
      return;
    }

    try {
      setPurchaseOrderLoading(true);
      setShowPurchaseOrderModal(true);
      const purchaseOrder = await fetchPurchaseOrderForOrder(order._id);
      setPurchaseOrderRecord(purchaseOrder);
    } catch (error) {
      closePurchaseOrderModal();
      triggerError(error.message);
    } finally {
      setPurchaseOrderLoading(false);
    }
  };

  const openTransferOrderModal = async (order) => {
    try {
      setTransferOrderLoading(true);
      setShowTransferOrderModal(true);
      const transferOrder = await fetchTransferOrderForOrder(order._id);
      setTransferOrderRecord(transferOrder);
    } catch (error) {
      closeTransferOrderModal();
      triggerError(error.message);
    } finally {
      setTransferOrderLoading(false);
    }
  };

  const handlePurchaseOrderSignature = async (signatureDataUrl) => {
    if (!purchaseOrderRecord?.order?._id) return;

    try {
      setPurchaseOrderSubmitting(true);
      const updatedPurchaseOrder = await signPurchaseOrder(purchaseOrderRecord.order._id, { signatureDataUrl });
      const refreshedPurchaseOrder = await fetchPurchaseOrderForOrder(purchaseOrderRecord.order._id);
      setPurchaseOrderRecord(refreshedPurchaseOrder);
      triggerSuccess(updatedPurchaseOrder.signingLink ? 'Supplier email sent.' : 'Purchase order signature saved.');
      await loadData();
    } catch (error) {
      triggerError(error.message);
    } finally {
      setPurchaseOrderSubmitting(false);
    }
  };

  const handleTransferOrderSignature = async (signatureDataUrl) => {
    if (!transferOrderRecord?.order?._id) return;

    try {
      setTransferOrderSubmitting(true);
      await signTransferOrder(transferOrderRecord.order._id, { signatureDataUrl });
      const refreshedTransferOrder = await fetchTransferOrderForOrder(transferOrderRecord.order._id);
      setTransferOrderRecord(refreshedTransferOrder);
      triggerSuccess('Stock transfer signature saved.');
      await loadData();
    } catch (error) {
      triggerError(error.message);
    } finally {
      setTransferOrderSubmitting(false);
    }
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
    if (isLow) return 'text-amber-400';
    return 'text-[#78DC8C]';
  };

  const formatCurrency = (value) => `\u20B1${Number(value || 0).toLocaleString()}`;

  const getCardStyle = (count, isLow) => {
    if (count <= 0) return 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)]';
    if (isLow) return 'border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.16)]';
    return 'border-[#FFB7C5] shadow-[0_0_10px_rgba(255,183,197,0.05)]';
  };

  const handleLogout = () => {
    localStorage.removeItem('lumiere_user');
    setUser(null);
  };

  const resetOrderForm = (overrides = {}) => {
      const nextProductId = overrides.product || defaultOrderForm.product;
      const selectedProduct = products.find((product) => product._id === nextProductId);
      const selectedSupplierId = getCheapestSupplierQuote(selectedProduct)?.supplierId
        || selectedProduct?.suppliers?.[0]?._id
        || selectedProduct?.suppliers?.[0]
        || '';
    const defaultWarehouseName = getDefaultTransferTargetWarehouse() || defaultOrderForm.warehouse;
    const nextOrderType = overrides.orderType || (canSupplierRestock ? 'Inbound' : 'Transfer');
    const nextTargetWarehouse = overrides.warehouse || (nextOrderType === 'Inbound' ? WAREHOUSE_A_NAME : defaultWarehouseName);
    const nextSourceWarehouse = overrides.sourceWarehouse || defaultOrderForm.sourceWarehouse;

    setNewOrder({
      ...defaultOrderForm,
      warehouse: nextTargetWarehouse,
      sourceWarehouse: nextOrderType === 'Transfer' ? nextSourceWarehouse : '',
      ...overrides,
      supplier: nextOrderType === 'Inbound' ? (overrides.supplier ?? selectedSupplierId) : '',
    });
  };

  const openNewOrderModal = (overrides = {}) => {
    resetOrderForm(overrides);
    setShowOrderModal(true);
  };

  const handleOrderTypeChange = (orderType) => {
    const nextTargetWarehouse = orderType === 'Inbound'
      ? WAREHOUSE_A_NAME
      : getDefaultTransferTargetWarehouse();

    setNewOrder((currentOrder) => ({
      ...currentOrder,
      orderType,
      warehouse: nextTargetWarehouse,
        sourceWarehouse: '',
        supplier: orderType === 'Inbound'
          ? (getCheapestSupplierQuote(selectedOrderProduct)?.supplierId || selectedOrderProduct?.suppliers?.[0]?._id || selectedOrderProduct?.suppliers?.[0] || '')
          : '',
      }));
    };

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    try {
      const orderPayload = {
        ...newOrder,
        orderType: modalOrderType,
        supplier: modalOrderType === 'Inbound' ? newOrder.supplier : '',
        sourceWarehouse: modalOrderType === 'Transfer' ? newOrder.sourceWarehouse : '',
      };
      await createOrder(orderPayload);
      resetOrderForm();
      setShowOrderModal(false);
      setShowNotifications(false); 
      triggerSuccess(`Successful: ${modalOrderType} request initiated.`);
      loadData();
    } catch (error) {
      triggerError(error.message);
    }
  };

  const handleDeliver = async (id, type) => {
    try {
      await updateOrderStatus(id, 'Delivered');
      triggerSuccess(type === 'Inbound' ? 'Order received successfully.' : `System Update: ${type} transfer confirmed.`);
      loadData(); 
    } catch (error) {
      triggerError(error.message);
    }
  };

  const handleAccountingAction = async (orderId, action, options = {}) => {
    try {
      const updatedOrder = await updateOrderAccounting(orderId, action, options);
      if (action === 'DISBURSE' || action === 'RETRY_DISBURSEMENT' || action === 'REFRESH_DISBURSEMENT') {
        const methodSummary = getOrderAccountingPaymentMethodSummary(updatedOrder);
        if (updatedOrder.checkoutUrl) {
          triggerSuccess('Opening Xendit checkout...');
          window.location.href = updatedOrder.checkoutUrl;
          return;
        } else if (updatedOrder.accountingProvider === 'Escrow Simulation') {
          triggerSuccess(`Escrow funded using ${methodSummary}.`);
        } else if (updatedOrder.accountingSettlementStatus === 'Settled') {
          triggerSuccess(`Disbursement completed via ${methodSummary}.`);
        } else {
          triggerSuccess(`Disbursement submitted via ${methodSummary}. Xendit status: ${updatedOrder.accountingExternalStatus || 'ACCEPTED'}.`);
        }
      } else if (action === 'RELEASE_ESCROW') {
        triggerSuccess('Escrow released successfully.');
      } else {
        triggerSuccess('Collection recorded successfully.');
      }
      loadData();
    } catch (error) {
      triggerError(error.message);
    }
  };

  const openAccountingActionModal = (order, action) => {
    if (orderNeedsSupplierQuoteForDisbursement(order)) {
      triggerError('Cannot disburse this payable yet. Save a supplier quote first so the payable amount is greater than 0.');
      return;
    }

    if (action === 'DISBURSE') {
      setSelectedAccountingPaymentMethod(mapSupplierPrimaryPaymentMethodToCheckoutOption(order.supplier).id);
      setAccountingActionTarget({ order, action });
      return;
    }

    setSelectedAccountingPaymentMethod('');
    setAccountingActionTarget({ order, action });
  };

  const closeAccountingActionModal = () => {
    setAccountingActionTarget(null);
    setSelectedAccountingPaymentMethod('');
  };

  const confirmAccountingAction = async () => {
    if (!accountingActionTarget) return;
    const { order, action } = accountingActionTarget;
    const options = { confirmed: true };
    if (action === 'DISBURSE' && selectedAccountingPaymentMethod) {
      options.paymentMethod = selectedAccountingPaymentMethod;
    }
    await handleAccountingAction(order._id, action, options);
    closeAccountingActionModal();
  };

  const resetProductForm = () => {
      setNewProduct({
        name: '',
        sku: '',
        category: '',
        price: '',
        reorderThreshold: 10,
        unitOfMeasure: 'unit',
    });
    barcodeScanBufferRef.current = '';
    barcodeScanLastInputAtRef.current = 0;
    barcodeScanActiveRef.current = false;
    if (barcodeScanTimeoutRef.current) {
      clearTimeout(barcodeScanTimeoutRef.current);
      barcodeScanTimeoutRef.current = null;
    }
    setShowCategorySuggestions(false);
    setShowUnitOfMeasureMenu(false);
    setEditingProductId(null);
  };

  const clearBarcodeScanState = () => {
    barcodeScanBufferRef.current = '';
    barcodeScanLastInputAtRef.current = 0;
    barcodeScanActiveRef.current = false;
    if (barcodeScanTimeoutRef.current) {
      clearTimeout(barcodeScanTimeoutRef.current);
      barcodeScanTimeoutRef.current = null;
    }
  };

  const openProductModalForScannedSku = (scannedValue) => {
    const normalizedSku = normalizeSkuValue(scannedValue);
    if (!normalizedSku || !canManageProducts) return;

    clearBarcodeScanState();
    setActiveTab('inventory');
    setIsSidebarOpen(false);
    setShowCategorySuggestions(false);
    setShowUnitOfMeasureMenu(false);
    setNewProduct({
      name: '',
      sku: normalizedSku,
      category: '',
      price: '',
      reorderThreshold: 10,
      unitOfMeasure: 'unit',
    });
    setShowProductModal(true);
  };

  const resetSupplierForm = () => {
    setSupplierForm({
      name: '',
      contactPerson: '',
      email: '',
      phone: '',
      address: '',
      leadTimeDays: 7,
      password: '',
    });
    setEditingSupplierId(null);
  };

  const resetWarehouseForm = () => {
    setWarehouseForm({ name: '', address: '', manager: '' });
    setEditingWarehouseId(null);
  };

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    try {
      const normalizedSku = normalizeSkuValue(newProduct.sku);
      if (!normalizedSku) {
        triggerError('Product code (SKU) is required.');
        return;
      }

      if (existingSkuProduct) {
        triggerError(`SKU already exists for ${existingSkuProduct.name}.`);
        return;
      }

      const productPayload = { ...newProduct, sku: normalizedSku };
      if (editingProductId) {
        await updateProduct(editingProductId, productPayload);
      } else {
        await createProduct(productPayload);
      }
      resetProductForm();
      setShowProductModal(false);
      triggerSuccess(editingProductId ? `Product updated: ${newProduct.name}` : `Product created: ${newProduct.name}`);
      loadData();
    } catch (error) {
      triggerError(error.message);
    }
  };

  const readFileAsBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const [, base64Payload = ''] = result.split(',');
      resolve(base64Payload);
    };
    reader.onerror = () => reject(new Error('The Excel file could not be read.'));
    reader.readAsDataURL(file);
  });

  const handleBulkProductImport = async (event) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';

    if (!selectedFile) return;

    if (!selectedFile.name.toLowerCase().endsWith('.xlsx')) {
      triggerError('Please upload an .xlsx Excel file for bulk import.');
      return;
    }

    try {
      setProductImportSubmitting(true);
      const encodedFile = await readFileAsBase64(selectedFile);
      const result = await importProducts(selectedFile.name, encodedFile);
      const importSummary = [
        `${result.createdCount || 0} product${result.createdCount === 1 ? '' : 's'} imported.`,
        result.skippedCount ? `${result.skippedCount} skipped.` : '',
      ].filter(Boolean).join(' ');
      triggerSuccess(importSummary || result.message || 'Products imported successfully.');
      if (Array.isArray(result.errors) && result.errors.length > 0) {
        triggerError(result.errors.slice(0, 3).join(' '));
      }
      await loadData();
      resetProductForm();
      setShowProductModal(false);
    } catch (error) {
      triggerError(error.message);
    } finally {
      setProductImportSubmitting(false);
    }
  };

  const handleDownloadProductImportTemplate = async () => {
    try {
      setProductTemplateDownloading(true);
      const templateBlob = await downloadProductImportTemplate();
      const blobUrl = window.URL.createObjectURL(templateBlob);
      const downloadLink = document.createElement('a');
      downloadLink.href = blobUrl;
      downloadLink.download = 'lumiere-product-import-template.xlsx';
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      window.URL.revokeObjectURL(blobUrl);
      triggerSuccess('Excel import template downloaded.');
    } catch (error) {
      triggerError(error.message);
    } finally {
      setProductTemplateDownloading(false);
    }
  };

  const startEditingProduct = (product) => {
    setEditingProductId(product._id);
    setNewProduct({
      name: product.name || '',
      sku: normalizeSkuValue(product.sku),
      category: product.category || '',
      price: Number(product.price) || '',
      reorderThreshold: Number(product.reorderThreshold) || 10,
      unitOfMeasure: product.unitOfMeasure || 'unit',
    });
    clearBarcodeScanState();
    setShowCategorySuggestions(false);
    setShowUnitOfMeasureMenu(false);
    setSelectedInventoryProductId(null);
    setShowProductModal(true);
  };

  const handleDeleteProduct = async (product) => {
    setProductPendingDelete(product);
    setShowDeleteProductModal(true);
  };

  const confirmDeleteProduct = async () => {
    if (!productPendingDelete) return;

    try {
      await deleteProduct(productPendingDelete._id);
      if (selectedInventoryProductId === productPendingDelete._id) {
        setSelectedInventoryProductId(null);
      }
      triggerSuccess(`Product removed: ${productPendingDelete.name}`);
      setShowDeleteProductModal(false);
      setProductPendingDelete(null);
      await loadData();
    } catch (error) {
      triggerError(error.message);
    }
  };

  const closeDeleteProductModal = () => {
    setShowDeleteProductModal(false);
    setProductPendingDelete(null);
  };

  const toggleProductSupplierBinding = async (productId, supplierId) => {
    const targetProduct = products.find((product) => product._id === productId);
    if (!targetProduct) return;

    const currentSupplierIds = (targetProduct.suppliers || []).map((supplier) => supplier?._id || supplier).filter(Boolean);
    const nextSupplierIds = currentSupplierIds.includes(supplierId)
      ? currentSupplierIds.filter((id) => id !== supplierId)
      : [...currentSupplierIds, supplierId];

    try {
      setProductSupplierUpdateId(`${productId}:${supplierId}`);
      const nextSupplierPricing = getProductSupplierPricing(targetProduct)
        .filter((entry) => nextSupplierIds.includes(entry.supplierId))
        .map((entry) => ({ supplier: entry.supplierId, cost: entry.cost }));
      await updateProduct(productId, { suppliers: nextSupplierIds, supplierPricing: nextSupplierPricing });
      triggerSuccess('Supplier bindings updated.');
      loadData();
    } catch (error) {
      triggerError(error.message);
    } finally {
      setProductSupplierUpdateId('');
    }
  };

  const handleSupplierCostDraftChange = (supplierId, value) => {
    if (value === '') {
      setProductSupplierCostDrafts((currentDrafts) => ({ ...currentDrafts, [supplierId]: '' }));
      return;
    }

    if (!/^\d*(\.\d{0,2})?$/.test(value)) return;

    setProductSupplierCostDrafts((currentDrafts) => ({ ...currentDrafts, [supplierId]: value }));
  };

  const handleSupplierOwnCostDraftChange = (productId, value) => {
    if (value === '') {
      setSupplierOwnCostDrafts((currentDrafts) => ({ ...currentDrafts, [productId]: '' }));
      return;
    }

    if (!/^\d*(\.\d{0,2})?$/.test(value)) return;

    setSupplierOwnCostDrafts((currentDrafts) => ({ ...currentDrafts, [productId]: value }));
  };

  const saveProductSupplierCost = async (productId, supplierId) => {
    const targetProduct = products.find((product) => product._id === productId);
    if (!targetProduct) return;

    const draftValue = productSupplierCostDrafts[supplierId];
    const parsedCost = Number(draftValue);
    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      triggerError('Supplier cost must be 0 or higher.');
      return;
    }

    const currentPricing = getProductSupplierPricing(targetProduct);
    const nextSupplierPricing = [
      ...currentPricing.filter((entry) => entry.supplierId !== supplierId),
      { supplier: supplierId, cost: parsedCost },
    ].sort((leftEntry, rightEntry) => leftEntry.supplierId.localeCompare(rightEntry.supplierId));

    try {
      setProductSupplierCostUpdateId(`${productId}:${supplierId}`);
      await updateProduct(productId, {
        supplierPricing: nextSupplierPricing,
      });
      triggerSuccess('Supplier cost saved.');
      loadData();
    } catch (error) {
      triggerError(error.message);
    } finally {
      setProductSupplierCostUpdateId('');
    }
  };

  const saveSupplierOwnProductCost = async (productId) => {
    if (!currentSupplierId) return;

    const targetProduct = products.find((product) => product._id === productId);
    if (!targetProduct) return;

    const draftValue = supplierOwnCostDrafts[productId];
    const parsedCost = Number(draftValue);
    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      triggerError('Supplier cost must be 0 or higher.');
      return;
    }

    try {
      setSupplierOwnCostUpdateId(productId);
      await updateProduct(productId, {
        supplierPricing: [{ supplier: currentSupplierId, cost: parsedCost }],
      });
      triggerSuccess('Your supplier cost was updated.');
      loadData();
    } catch (error) {
      triggerError(error.message);
    } finally {
      setSupplierOwnCostUpdateId('');
    }
  };

  const toggleSupplierProductLink = async (product) => {
    if (!currentSupplierId) return;

    const currentSupplierIds = (product.suppliers || []).map((supplier) => String(supplier?._id || supplier)).filter(Boolean);
    const isLinked = currentSupplierIds.includes(currentSupplierId);
    const nextSupplierIds = isLinked
      ? currentSupplierIds.filter((supplierId) => supplierId !== currentSupplierId)
      : [...currentSupplierIds, currentSupplierId];

    try {
      setSupplierOwnCostUpdateId(`link:${product._id}`);
      await updateProduct(product._id, { suppliers: nextSupplierIds });
      triggerSuccess(isLinked ? `Unlinked from ${product.name}.` : `Linked to ${product.name}.`);
      await loadData();
    } catch (error) {
      triggerError(error.message);
    } finally {
      setSupplierOwnCostUpdateId('');
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
      const editedSupplier = editingSupplierId ? suppliers.find((supplier) => supplier._id === editingSupplierId) : null;
      const requiresAccountCreationPassword = !editedSupplier?.accountUser;

      if ((requiresAccountCreationPassword || !editingSupplierId) && String(supplierForm.password || '').trim().length < 6) {
        triggerError('Supplier password must be at least 6 characters long to create the supplier account.');
        return;
      }

      if (editingSupplierId) {
        await updateSupplier(editingSupplierId, supplierForm);
        if (requiresAccountCreationPassword && String(supplierForm.password || '').trim()) {
          await createOrUpdateSupplierAccount(editingSupplierId, { password: supplierForm.password });
        }
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
      password: '',
    });
    setShowSupplierModal(true);
  };

  const handleSupplierPaymentMethodDraftChange = (field, value) => {
    setSupplierPaymentMethodDraft((currentMethod) => {
      if (field === 'accountNumber') {
        return {
          ...currentMethod,
          accountNumber: String(value || '').replace(/\D/g, ''),
        };
      }

      if (field === 'methodType') {
        const nextProviderCode = supplierPayoutOptions[value]?.[0]?.code || '';
        return {
          ...currentMethod,
          methodType: value,
          providerCode: nextProviderCode,
          methodName: getSupplierPaymentProviderLabel(value, nextProviderCode),
        };
      }

      if (field === 'providerCode') {
        return {
          ...currentMethod,
          providerCode: value,
          methodName: getSupplierPaymentProviderLabel(currentMethod.methodType, value),
        };
      }

      return { ...currentMethod, [field]: value };
    });
  };

  const openSupplierPaymentMethodModal = (index = null) => {
    setEditingSupplierPaymentMethodIndex(index);
    const fallbackDraft = createEmptySupplierPaymentMethod();
    fallbackDraft.isPrimary = supplierPaymentMethods.length === 0;
    setSupplierPaymentMethodDraft(
      index !== null && supplierPaymentMethods[index]
        ? normalizeSupplierPaymentMethodForForm(supplierPaymentMethods[index])
        : fallbackDraft
    );
    setShowSupplierPaymentMethodModal(true);
  };

  const closeSupplierPaymentMethodModal = () => {
    setShowSupplierPaymentMethodModal(false);
    setEditingSupplierPaymentMethodIndex(null);
    setSupplierPaymentMethodDraft(createEmptySupplierPaymentMethod());
  };

  const persistSupplierPaymentMethods = async (nextMethods, successText) => {
    const normalizedMethods = nextMethods
      .map((method) => ({
        ...method,
        methodName: getSupplierPaymentProviderLabel(method.methodType, method.providerCode),
      }))
      .filter((method) => method.providerCode && method.accountName && method.accountNumber);

    const updatedSupplier = await updateOwnSupplierPaymentMethods(normalizedMethods);
    setSupplierProfile(updatedSupplier);
    setSupplierPaymentMethods(
      updatedSupplier?.paymentMethods?.length
        ? updatedSupplier.paymentMethods.map(normalizeSupplierPaymentMethodForForm)
        : []
    );
    if (successText) {
      triggerSuccess(successText);
    }
  };

  const saveSupplierPaymentMethodDraft = async (e) => {
    e.preventDefault();

    if (!supplierPaymentMethodDraft.providerCode || !supplierPaymentMethodDraft.accountName || !supplierPaymentMethodDraft.accountNumber) {
      triggerError('Complete the payout method details before saving.');
      return;
    }

    const normalizedDraft = {
      ...supplierPaymentMethodDraft,
      methodName: getSupplierPaymentProviderLabel(supplierPaymentMethodDraft.methodType, supplierPaymentMethodDraft.providerCode),
    };

    let nextMethods = editingSupplierPaymentMethodIndex === null
      ? [...supplierPaymentMethods, normalizedDraft]
      : supplierPaymentMethods.map((method, methodIndex) => (
          methodIndex === editingSupplierPaymentMethodIndex ? normalizedDraft : method
        ));

    if (normalizedDraft.isPrimary) {
      nextMethods = nextMethods.map((method, methodIndex) => ({
        ...method,
        isPrimary: editingSupplierPaymentMethodIndex === null
          ? methodIndex === nextMethods.length - 1
          : methodIndex === editingSupplierPaymentMethodIndex,
      }));
    }

    try {
      await persistSupplierPaymentMethods(
        nextMethods,
        editingSupplierPaymentMethodIndex !== null ? 'Payment method updated.' : 'Payment method added.'
      );
      closeSupplierPaymentMethodModal();
    } catch (error) {
      triggerError(error.message);
    }
  };

  const removeSupplierPaymentMethod = async (index) => {
    setSupplierPaymentMethodPendingDeleteIndex(index);
    setShowDeleteSupplierPaymentMethodModal(true);
  };

  const closeDeleteSupplierPaymentMethodModal = () => {
    setShowDeleteSupplierPaymentMethodModal(false);
    setSupplierPaymentMethodPendingDeleteIndex(null);
  };

  const confirmDeleteSupplierPaymentMethod = async () => {
    if (supplierPaymentMethodPendingDeleteIndex === null) return;

    try {
      const nextMethods = supplierPaymentMethods.filter((_, methodIndex) => methodIndex !== supplierPaymentMethodPendingDeleteIndex);
      await persistSupplierPaymentMethods(nextMethods, 'Payment method removed.');
      closeDeleteSupplierPaymentMethodModal();
    } catch (error) {
      triggerError(error.message);
    }
  };

  const setPrimarySupplierPaymentMethod = async (index) => {
    try {
      const nextMethods = supplierPaymentMethods.map((method, methodIndex) => ({
        ...method,
        isPrimary: methodIndex === index,
      }));
      await persistSupplierPaymentMethods(nextMethods, 'Primary payment method updated.');
    } catch (error) {
      triggerError(error.message);
    }
  };

  const handleSupplierPaymentMethodsSubmit = async (e) => {
    e.preventDefault();

    try {
      await persistSupplierPaymentMethods(supplierPaymentMethods, 'Account settings updated.');
    } catch (error) {
      triggerError(error.message);
    }
  };

  const handleSupplierPasswordSubmit = async (e) => {
    e.preventDefault();

    if (!supplierPasswordForm.password || supplierPasswordForm.password.length < 6) {
      triggerError('Password must be at least 6 characters long.');
      return;
    }

    if (supplierPasswordForm.password !== supplierPasswordForm.confirmPassword) {
      triggerError('Passwords do not match.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/users/${user._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
        body: JSON.stringify({ password: supplierPasswordForm.password }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Unable to update password.');
      }

      setSupplierPasswordForm({ password: '', confirmPassword: '' });
      triggerSuccess('Password updated.');
    } catch (error) {
      triggerError(error.message);
    }
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
      manager: warehouse.manager?._id || '',
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
  const managerUsers = users.filter((account) => account.role === 'Manager');
  const managedWarehouses = user?.role === 'Manager'
    ? warehouses.filter((warehouse) => warehouse.manager?._id === user._id)
    : warehouses;
  const assignedWarehouseNames = user?.role === 'Manager'
    ? managedWarehouses.map((warehouse) => warehouse.name)
    : [];
  const assignedWarehouseLabel = assignedWarehouseNames.join(', ');
  const filteredCategorySuggestions = existingCategories.filter((category) =>
    newProduct.category.trim()
      ? category.toLowerCase().includes(newProduct.category.toLowerCase())
      : true
  );
  const normalizedProductSku = normalizeSkuValue(newProduct.sku);
  const existingSkuProduct = products.find((product) => (
    normalizeSkuValue(product.sku) === normalizedProductSku &&
    product._id !== editingProductId
  ));
  const selectedSupplyNetworkProduct = products.find((product) => product._id === selectedSupplyNetworkProductId) || products[0] || null;
  const linkedSupplierIds = selectedSupplyNetworkProduct?.suppliers?.map((supplier) => supplier?._id || supplier).filter(Boolean) || [];
  const selectedSupplyNetworkProductPricing = getProductSupplierPricing(selectedSupplyNetworkProduct);
  const selectedSupplyNetworkCheapestQuote = getCheapestSupplierQuote(selectedSupplyNetworkProduct);
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });
  const supplierLinkedProducts = user?.role === 'Supplier' && currentSupplierId
    ? products.filter((product) => (product.suppliers || []).some((supplier) => String(supplier?._id || supplier) === currentSupplierId))
    : [];
  const supplierProductCatalog = user?.role === 'Supplier' && currentSupplierId
    ? [...products].sort((leftProduct, rightProduct) => {
        const leftLinked = (leftProduct.suppliers || []).some((supplier) => String(supplier?._id || supplier) === currentSupplierId);
        const rightLinked = (rightProduct.suppliers || []).some((supplier) => String(supplier?._id || supplier) === currentSupplierId);
        if (leftLinked !== rightLinked) return leftLinked ? -1 : 1;
        return leftProduct.name.localeCompare(rightProduct.name);
      })
    : [];
  const selectedSupplierProduct = supplierProductCatalog.find((product) => product._id === selectedSupplierProductId) || null;

  const lowStockAlerts = products.filter(p => p.isLowStock);
  const pendingOutbound = orders.filter(o => o.orderType === 'Outbound' && !['Delivered', 'Cancelled'].includes(o.status));
  const totalValue = products.reduce((acc, p) => acc + (p.price * p.totalStock), 0);
  const lowStockCount = products.filter(p => p.isLowStock).length;
  const warehouseNames = user?.role === 'Manager'
    ? assignedWarehouseNames
    : warehouses.map((warehouse) => warehouse.name);
  const isWarehouseAManager = user?.role === 'Manager' && assignedWarehouseNames.includes(WAREHOUSE_A_NAME);
  const canSupplierRestock = user?.role === 'SuperAdmin' || isWarehouseAManager;
  const canRequestTransfer = user?.role === 'SuperAdmin' || (user?.role === 'Manager' && !isWarehouseAManager);
  const modalOrderType = !canSupplierRestock && newOrder.orderType !== 'Outbound' ? 'Transfer' : newOrder.orderType;
  const selectedOrderProduct = products.find((product) => product._id === newOrder.product);
  const selectedOrderProductSuppliers = [...(selectedOrderProduct?.suppliers || [])].sort((leftSupplier, rightSupplier) => {
    const leftCost = getSupplierCostEntry(selectedOrderProduct, leftSupplier?._id || leftSupplier)?.cost;
    const rightCost = getSupplierCostEntry(selectedOrderProduct, rightSupplier?._id || rightSupplier)?.cost;

    if (typeof leftCost === 'number' && typeof rightCost === 'number') {
      return leftCost - rightCost;
    }

    if (typeof leftCost === 'number') return -1;
    if (typeof rightCost === 'number') return 1;
    return (leftSupplier?.name || '').localeCompare(rightSupplier?.name || '');
  });
  const selectedOrderSupplierCostEntry = getSupplierCostEntry(selectedOrderProduct, newOrder.supplier);
  const selectedOrderCheapestSupplierQuote = getCheapestSupplierQuote(selectedOrderProduct);
  const showSupplierSelection = modalOrderType === 'Inbound' && canSupplierRestock && newOrder.warehouse === WAREHOUSE_A_NAME;
  const orderWarehouseOptions = modalOrderType === 'Inbound'
    ? warehouses.filter((warehouse) => warehouse.name === WAREHOUSE_A_NAME)
    : managedWarehouses;
  const transferSourceWarehouseOptions = modalOrderType === 'Transfer' && selectedOrderProduct
    ? warehouses.filter((warehouse) => {
        if (warehouse.name === newOrder.warehouse) return false;
        const stockEntry = selectedOrderProduct.warehouses?.find((entry) => entry.name === warehouse.name);
        return (stockEntry?.stock || 0) > 0;
      })
    : [];
  const warehouseTotals = products.reduce((acc, product) => {
    (product.warehouses || []).forEach((warehouse) => {
      acc[warehouse.name] = (acc[warehouse.name] || 0) + warehouse.stock;
    });
    return acc;
  }, Object.fromEntries(warehouseNames.map((name) => [name, 0])));
  const selectedInventoryProduct = filteredProducts.find((product) => product._id === selectedInventoryProductId) || null;
  const visibleLogs = user?.role === 'Supplier'
    ? orders.filter((order) => String(order.supplier?._id || order.supplier || '') === currentSupplierId)
    : orders.filter((order) => {
        const actorRole = order.createdBy?.role || order.createdByRole;
        return actorRole === 'Manager';
      });
  const rolePriority = { SuperAdmin: 0, Manager: 1, Accountant: 2, Supplier: 3, Staff: 4 };
  const sortedUsers = [...users].sort((a, b) => {
    const roleDiff = (rolePriority[a.role] ?? 99) - (rolePriority[b.role] ?? 99);
    if (roleDiff !== 0) return roleDiff;
    return a.name.localeCompare(b.name);
  });
  const supplierAccountingOrders = orders
    .filter((order) => order.orderType === 'Inbound' && order.status !== 'Cancelled' && order.status === 'Delivered')
    .map((order) => {
      const supplierUnitPrice = getOrderSupplierUnitPrice(order);
      const expenseAmount = getOrderExpenseAmount(order);
      const settlementStatus = order.accountingSettlementStatus || 'Open';
      const isEscrowSimulation = order.accountingProvider === 'Escrow Simulation' || order.accountingExternalStatus === 'HELD';
      const accountingTerm = settlementStatus === 'Settled'
        ? 'Paid'
        : settlementStatus === 'InProgress'
          ? (isEscrowSimulation ? 'Escrow Held' : 'In Progress')
          : settlementStatus === 'Failed'
            ? 'Failed'
            : 'Payable';
      const accountingAction = settlementStatus === 'Settled'
        ? ''
        : settlementStatus === 'Failed'
          ? 'RETRY_DISBURSEMENT'
          : settlementStatus === 'InProgress'
            ? (isEscrowSimulation ? 'RELEASE_ESCROW' : 'REFRESH_DISBURSEMENT')
            : 'DISBURSE';
      return {
        ...order,
        supplierUnitPrice,
        expenseAmount,
        accountingTerm,
        accountingAction,
        isEscrowSimulation,
      };
    });
  const customerAccountingOrders = orders
    .filter((order) => order.orderType === 'Outbound' && order.status !== 'Cancelled')
    .map((order) => {
      const customerUnitPrice = getOrderCustomerUnitPrice(order);
      const receivableAmount = getOrderReceivableAmount(order);
      return {
        ...order,
        customerUnitPrice,
        receivableAmount,
        accountingTerm: order.accountingSettlementStatus === 'Settled' ? 'Collections' : 'Accounts Receivable',
        accountingAction: order.accountingSettlementStatus === 'Settled' ? '' : 'COLLECT',
      };
    });
  const visibleAccountingOrders = [...supplierAccountingOrders, ...customerAccountingOrders]
    .sort((leftOrder, rightOrder) => new Date(rightOrder.createdAt) - new Date(leftOrder.createdAt));
  const accountsPayableTotal = supplierAccountingOrders
    .filter((order) => order.accountingSettlementStatus !== 'Settled')
    .reduce((sum, order) => sum + order.expenseAmount, 0);
  const disbursementTotal = supplierAccountingOrders
    .filter((order) => order.accountingSettlementStatus === 'Settled')
    .reduce((sum, order) => sum + order.expenseAmount, 0);
  const accountsReceivableTotal = customerAccountingOrders
    .filter((order) => order.accountingSettlementStatus !== 'Settled')
    .reduce((sum, order) => sum + order.receivableAmount, 0);
  const collectionsTotal = customerAccountingOrders
    .filter((order) => order.accountingSettlementStatus === 'Settled')
    .reduce((sum, order) => sum + order.receivableAmount, 0);
  const currentExpenseLedgerOrders = expenseSubTab === 'receivables'
    ? customerAccountingOrders.filter((order) => order.accountingSettlementStatus !== 'Settled')
    : supplierAccountingOrders.filter((order) => order.accountingSettlementStatus !== 'Settled');
  const historicalExpenseLedgerOrders = expenseSubTab === 'receivables'
    ? customerAccountingOrders.filter((order) => order.accountingSettlementStatus === 'Settled')
    : supplierAccountingOrders.filter((order) => order.accountingSettlementStatus === 'Settled');
  const visibleExpenseLedgerOrders = expenseViewMode === 'history'
    ? historicalExpenseLedgerOrders
    : currentExpenseLedgerOrders;
  const disbursementHistoryEntries = supplierAccountingOrders
    .flatMap((order) => (
      Array.isArray(order.disbursementHistory)
        ? order.disbursementHistory.map((entry, entryIndex) => ({
            ...entry,
            key: `${order._id}-${entryIndex}-${entry.createdAt || ''}`,
            order,
          }))
        : []
    ))
    .sort((leftEntry, rightEntry) => new Date(rightEntry.createdAt) - new Date(leftEntry.createdAt));
  const getOrderActor = (order) => {
    const name = order.createdBy?.name || order.createdByName || 'Lumiere Manager';
    const rawRole = order.createdBy?.role || order.createdByRole;
    return {
      name,
      role: !rawRole || rawRole === 'Unknown' ? 'Manager' : rawRole,
    };
  };
  const canManageOrderAction = (order) => {
    if (user?.role === 'SuperAdmin') return true;
    if (user?.role !== 'Manager') return false;
    return assignedWarehouseNames.includes(order.warehouse) || (order.sourceWarehouse && assignedWarehouseNames.includes(order.sourceWarehouse));
  };
  const getInboundLogStatusLabel = (order) => {
    if (order.status === 'Cancelled') return 'Cancelled';
    if (order.status === 'Delivered') return 'Order Received';
    if (!order.purchaseOrder) return 'Preparing Purchase Order';

    if (order.purchaseOrder.status === 'Awaiting Supplier Signature') {
      if (user?.role === 'Supplier') return 'Awaiting Your Signature';
      return 'Preparing Purchase Order';
    }

    if (order.purchaseOrder.status === 'Supplier Signed') {
      if (user?.role === 'Supplier') return 'Signed By You';
      return 'Ready For Order Receive';
    }

    return order.purchaseOrder.status;
  };
  const getTransferLogStatusLabel = (order) => {
    if (order.status === 'Cancelled') return 'Cancelled';
    if (order.status === 'Delivered') return 'Transfer Completed';
    if (!order.transferOrder) return 'Preparing Transfer Document';
    if (order.transferOrder.status === 'Awaiting Requesting Warehouse Manager Signature') return 'Awaiting Requester';
    if (order.transferOrder.status === 'Awaiting Requested Warehouse Manager Signature') return 'Awaiting Source';
    if (order.transferOrder.status === 'Transfer Signed') return 'Ready To Receive';
    return 'Preparing Transfer';
  };
  const getStatusLabel = (order) => {
    if (order.status === 'Cancelled') return 'Cancelled';
    if (order.orderType === 'Inbound') return getInboundLogStatusLabel(order);
    if (order.orderType === 'Transfer') return getTransferLogStatusLabel(order);
    if (order.status === 'Delivered') return order.orderType === 'Outbound' ? 'Delivered' : 'Completed';
    return order.status;
  };
  const getTransferLogWarehouseValue = (order) =>
    isWarehouseAManager || user?.role === 'SuperAdmin' ? order.warehouse : order.sourceWarehouse;
  const canSignInboundPurchaseOrder = (order) => {
    if (order.orderType !== 'Inbound' || order.warehouse !== WAREHOUSE_A_NAME) return false;
    const status = order.purchaseOrder?.status;
    if (user?.role === 'Manager') {
      return isWarehouseAManager && status === 'Awaiting Warehouse Manager Signature';
    }
    if (user?.role === 'SuperAdmin') {
      return status === 'Awaiting CEO Signature';
    }
    return false;
  };
  const canDeliverInboundPurchaseOrder = (order) => {
    if (order.orderType !== 'Inbound') return false;
    return (
      user?.role === 'Manager' &&
      canManageOrderAction(order) &&
      order.purchaseOrder?.status === 'Supplier Signed'
    );
  };
  const canSupplierSignPurchaseOrder = (order) =>
    user?.role === 'Supplier' &&
    order.orderType === 'Inbound' &&
    order.purchaseOrder?.status === 'Awaiting Supplier Signature' &&
    Boolean(order.purchaseOrder?.supplierSigningToken);
  const canSignTransferOrder = (order) => {
    if (order.orderType !== 'Transfer' || user?.role !== 'Manager') return false;

    const status = order.transferOrder?.status;
    if (status === 'Awaiting Requesting Warehouse Manager Signature') {
      return assignedWarehouseNames.includes(order.warehouse);
    }

    if (status === 'Awaiting Requested Warehouse Manager Signature') {
      return assignedWarehouseNames.includes(order.sourceWarehouse);
    }

    return false;
  };
  const canDeliverTransferOrder = (order) => {
    if (order.orderType !== 'Transfer') return false;
    return (
      user?.role === 'Manager' &&
      assignedWarehouseNames.includes(order.warehouse) &&
      order.transferOrder?.status === 'Transfer Signed'
    );
  };
  const canOpenPurchaseOrder = (order) =>
    order.orderType === 'Inbound' &&
    (
      user?.role === 'Supplier'
        ? Boolean(order.purchaseOrder?.supplierSigningToken || order.purchaseOrder?.finalDocumentUrl || order.purchaseOrder?.companyDocumentUrl)
        : Boolean(order.purchaseOrder?.warehouseManagerSignature?.signedAt || order.purchaseOrder?.ownerSignature?.signedAt || order.purchaseOrder?.supplierSignature?.signedAt)
    );
  const canOpenTransferOrder = (order) =>
    order.orderType === 'Transfer' &&
    Boolean(order.transferOrder?.requestingWarehouseSignature?.signedAt || order.transferOrder?.requestedWarehouseSignature?.signedAt);
  const canCurrentUserSignPurchaseOrderRecord = (record) => {
    if (!record?.order) return false;
    return canSignInboundPurchaseOrder({
      orderType: 'Inbound',
      warehouse: record.order.warehouse,
      purchaseOrder: record,
    });
  };
  const canCurrentUserSignTransferOrderRecord = (record) => {
    if (!record?.order) return false;
    return canSignTransferOrder({
      orderType: 'Transfer',
      warehouse: record.order.warehouse,
      sourceWarehouse: record.order.sourceWarehouse,
      transferOrder: record,
    });
  };
  const getDocumentUrl = (fileUrl) => {
    if (!fileUrl) return '';
    if (fileUrl.startsWith('http')) return fileUrl;
    return `${API_ORIGIN}${fileUrl}`;
  };
  const hasCompanySignedCopy = Boolean(purchaseOrderRecord?.companyDocumentUrl);
  const hasFinalSignedCopy = Boolean(purchaseOrderRecord?.finalDocumentUrl);
  const purchaseOrderSupplierCostEntry = purchaseOrderRecord?.order?.product && purchaseOrderRecord?.order?.supplier?._id
    ? getSupplierCostEntry(purchaseOrderRecord.order.product, purchaseOrderRecord.order.supplier._id)
    : null;
  const hasTransferDraftCopy = Boolean(transferOrderRecord?.documentUrl);
  const hasTransferFinalCopy = Boolean(transferOrderRecord?.finalDocumentUrl);
  const transferLogColumnLabel = isWarehouseAManager || user?.role === 'SuperAdmin' ? 'Requested' : 'Source';
  const getLogActionLabel = (order) => {
    if (order.status === 'Delivered') return order.orderType === 'Inbound' ? 'Order Received' : 'Completed';
    if (order.status === 'Cancelled') return 'Cancelled';
    if (!canManageOrderAction(order)) return 'View Status';
    if (order.orderType === 'Inbound' && canSignInboundPurchaseOrder(order)) return 'Sign';
    if (order.orderType === 'Transfer' && canSignTransferOrder(order)) return 'Sign';
    if (order.orderType === 'Inbound' && canDeliverInboundPurchaseOrder(order)) return 'Order Receive';
    if (order.orderType === 'Transfer' && canDeliverTransferOrder(order)) return 'Transfer Receive';
    if (order.orderType === 'Outbound') return 'Deliver';
    return 'Cancel';
  };
  const filteredManagerLogs = visibleLogs.filter((order) => {
    const formattedDate = new Date(order.createdAt).toLocaleString();
    const actor = getOrderActor(order);
    const productName = order.product?.name || 'N/A';
    const typeLabel = order.orderType === 'Transfer' ? 'Transfer Request' : order.orderType;
    const statusLabel = getStatusLabel(order);
    const requestedValue = order.orderType === 'Transfer' ? getTransferLogWarehouseValue(order) : order.warehouse;
    const actionLabel = getLogActionLabel(order);
    const matchesDate = !logDateFilter || formattedDate.toLowerCase().includes(logDateFilter.toLowerCase());
    const matchesRequester = !logRequesterFilter || actor.name.toLowerCase().includes(logRequesterFilter.toLowerCase());
    const matchesProduct = !logProductFilter || productName.toLowerCase().includes(logProductFilter.toLowerCase());
    const matchesType = logTypeFilter === 'All' || typeLabel === logTypeFilter;
    const matchesWarehouse = !logWarehouseFilter || String(requestedValue || '').toLowerCase().includes(logWarehouseFilter.toLowerCase());
    const matchesStatus = logStatusFilter === 'All' || statusLabel === logStatusFilter;
    const matchesAction = logActionFilter === 'All' || actionLabel === logActionFilter;
    return matchesDate && matchesRequester && matchesProduct && matchesType && matchesWarehouse && matchesStatus && matchesAction;
  });
  const supplierPendingOrders = orders.filter((order) => order.status === 'Pending').length;
  const supplierCompletedOrders = orders.filter((order) => order.status === 'Delivered').length;
  const supplierAwaitingSignatureOrders = orders.filter((order) => order.purchaseOrder?.status === 'Awaiting Supplier Signature').length;

  useEffect(() => {
    if (!showOrderModal || modalOrderType !== 'Transfer') return;

    if (!selectedOrderProduct || transferSourceWarehouseOptions.length === 0) {
      if (newOrder.sourceWarehouse) {
        setNewOrder((currentOrder) => ({ ...currentOrder, sourceWarehouse: '' }));
      }
      return;
    }

    const sourceStillValid = transferSourceWarehouseOptions.some(
      (warehouse) => warehouse.name === newOrder.sourceWarehouse
    );

    if (!sourceStillValid) {
      setNewOrder((currentOrder) => ({
        ...currentOrder,
        sourceWarehouse: transferSourceWarehouseOptions[0]?.name || '',
      }));
    }
  }, [
    showOrderModal,
    modalOrderType,
    selectedOrderProduct,
    transferSourceWarehouseOptions,
    newOrder.sourceWarehouse,
  ]);

  const canEditUser = (targetUser) => {
    if (targetUser.role === 'Supplier') return false;
    if (user.role === 'SuperAdmin') return targetUser.role !== 'SuperAdmin' || targetUser._id === user._id;
    if (user.role === 'Manager') {
      if (targetUser._id === user._id) return true;
      return ['Staff', 'Accountant'].includes(targetUser.role) && targetUser.createdBy?._id === user._id;
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

  if (supplierSignToken) {
    return <SupplierSignPage token={supplierSignToken} modal onClose={() => window.location.assign('/')} />;
  }

  if (!user) return <Login setAuthUser={setUser} />;

  return (
    <div className="flex min-h-screen bg-[#2C2B30] relative overflow-hidden text-gray-200 font-mono">
      {successMessage && (
        <div className="pointer-events-none fixed inset-x-0 top-6 z-[200] flex justify-center px-4">
          <div className="max-w-[min(92vw,900px)] rounded-full bg-green-500 px-8 py-3 text-center font-bold uppercase tracking-[0.12em] text-white shadow-2xl animate-bounce">
            {successMessage}
          </div>
        </div>
      )}
      {errorMessage && (
        <div className="pointer-events-none fixed inset-x-0 top-6 z-[200] flex justify-center px-4">
          <div className="max-w-[min(92vw,900px)] rounded-full bg-red-500 px-8 py-3 text-center font-bold uppercase tracking-[0.12em] text-white shadow-2xl">
            {errorMessage}
          </div>
        </div>
      )}

      <div className="absolute inset-0 bg-grid pointer-events-none opacity-40"></div>
      <div className="glow-orb w-[500px] h-[500px] -top-20 -left-40 bg-[#F2C4CE]/10"></div>
      <div className="glow-orb w-[400px] h-[400px] bottom-0 -right-20 bg-[#F58F7C]/10"></div>

      {(activeSupplierPurchaseOrderRecord || activeSupplierSignToken) && user?.role === 'Supplier' && (
        <SupplierSignPage
          token={activeSupplierSignToken}
          modal
          initialPurchaseOrder={activeSupplierPurchaseOrderRecord}
          onClose={() => {
            setActiveSupplierSignToken(null);
            setActiveSupplierPurchaseOrderRecord(null);
          }}
          onSigned={loadData}
        />
      )}

      <aside className={`fixed md:relative z-50 w-64 border-r border-[#5A595E] flex flex-col bg-[#232226] transform transition-transform duration-300 h-screen sticky top-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-6 flex items-center justify-between border-b border-[#5A595E]/30">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#F2C4CE] flex items-center justify-center font-bold text-[#2C2B30]">L</div>
            <h1 className="font-bold text-lg text-[#F2C4CE]">Lumière</h1>
          </div>
          <button className="md:hidden" onClick={() => setIsSidebarOpen(false)}><X size={20} /></button>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <button onClick={() => {setActiveTab('inventory'); setIsSidebarOpen(false)}} className={`w-full text-left p-3 rounded-lg text-base font-bold transition-all ${activeTab === 'inventory' ? 'bg-[#F2C4CE]/10 text-[#F2C4CE] border border-[#F2C4CE]/20' : 'text-gray-400 hover:bg-white/5'}`}>{['Supplier', 'Accountant'].includes(user.role) ? 'DASHBOARD' : 'INVENTORY'}</button>
          {user.role === 'Supplier' && (
            <button onClick={() => {setActiveTab('supplierProducts'); setIsSidebarOpen(false)}} className={`w-full text-left p-3 rounded-lg text-base font-bold transition-all ${activeTab === 'supplierProducts' ? 'bg-[#F2C4CE]/10 text-[#F2C4CE] border border-[#F2C4CE]/20' : 'text-gray-400 hover:bg-white/5'}`}>PRODUCTS</button>
          )}
          <button onClick={() => {setActiveTab('orders'); setIsSidebarOpen(false)}} className={`w-full text-left p-3 rounded-lg text-base font-bold transition-all ${activeTab === 'orders' ? 'bg-[#F2C4CE]/10 text-[#F2C4CE] border border-[#F2C4CE]/20' : 'text-gray-400 hover:bg-white/5'}`}>LOGS</button>
          {canViewExpenses && (
            <button onClick={() => {setActiveTab('expenses'); setIsSidebarOpen(false)}} className={`w-full text-left p-3 rounded-lg text-base font-bold transition-all ${activeTab === 'expenses' ? 'bg-[#F2C4CE]/10 text-[#F2C4CE] border border-[#F2C4CE]/20' : 'text-gray-400 hover:bg-white/5'}`}>EXPENSES</button>
          )}
          {activeTab === 'expenses' && canViewExpenses && (
            <div className="ml-3 mt-1 space-y-2 border-l border-[#5A595E]/40 pl-3">
              <button onClick={() => {setExpenseSubTab('payables'); setIsSidebarOpen(false)}} className={`w-full text-left p-2 rounded-lg text-[13px] font-bold uppercase tracking-[0.12em] transition-all ${expenseSubTab === 'payables' ? 'bg-[#F2C4CE]/10 text-[#F2C4CE] border border-[#F2C4CE]/20' : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'}`}>Accounts Payable</button>
              <button onClick={() => {setExpenseSubTab('receivables'); setIsSidebarOpen(false)}} className={`w-full text-left p-2 rounded-lg text-[13px] font-bold uppercase tracking-[0.12em] transition-all ${expenseSubTab === 'receivables' ? 'bg-[#F5A28F]/10 text-[#F5A28F] border border-[#F5A28F]/20' : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'}`}>Accounts Receivable</button>
            </div>
          )}
          {user.role === 'Supplier' && (
            <button onClick={() => {setActiveTab('paymentMethods'); setIsSidebarOpen(false)}} className={`w-full text-left p-3 rounded-lg text-base font-bold transition-all ${activeTab === 'paymentMethods' ? 'bg-[#F2C4CE]/10 text-[#F2C4CE] border border-[#F2C4CE]/20' : 'text-gray-400 hover:bg-white/5'}`}>ACCOUNT SETTINGS</button>
          )}
          {['Manager', 'SuperAdmin'].includes(user.role) && <button onClick={() => {setActiveTab('suppliers'); setSupplierSubTab('network'); setIsSidebarOpen(false)}} className={`w-full text-left p-3 rounded-lg text-base font-bold transition-all ${activeTab === 'suppliers' ? 'bg-[#F2C4CE]/10 text-[#F2C4CE] border border-[#F2C4CE]/20' : 'text-gray-400 hover:bg-white/5'}`}>SUPPLIER HUB</button>}
          {activeTab === 'suppliers' && ['Manager', 'SuperAdmin'].includes(user.role) && (
            <div className="ml-3 mt-1 space-y-2 border-l border-[#5A595E]/40 pl-3">
              <button onClick={() => {setSupplierSubTab('network'); setIsSidebarOpen(false)}} className={`w-full text-left p-2 rounded-lg text-[13px] font-bold uppercase tracking-[0.12em] transition-all ${supplierSubTab === 'network' ? 'bg-[#F2C4CE]/10 text-[#F2C4CE] border border-[#F2C4CE]/20' : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'}`}>Supply Network</button>
              <button onClick={() => {setSupplierSubTab('bindings'); setIsSidebarOpen(false)}} className={`w-full text-left p-2 rounded-lg text-[13px] font-bold uppercase tracking-[0.12em] transition-all ${supplierSubTab === 'bindings' ? 'bg-[#F5A28F]/10 text-[#F5A28F] border border-[#F5A28F]/20' : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'}`}>Supplier Binding</button>
              <button onClick={() => {setSupplierSubTab('warehouses'); setIsSidebarOpen(false)}} className={`w-full text-left p-2 rounded-lg text-[13px] font-bold uppercase tracking-[0.12em] transition-all ${supplierSubTab === 'warehouses' ? 'bg-[#F58F7C]/10 text-[#F58F7C] border border-[#F58F7C]/20' : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'}`}>Warehouse Directory</button>
            </div>
          )}
          {['Manager', 'SuperAdmin'].includes(user.role) && <button onClick={() => {setActiveTab('reports'); setIsSidebarOpen(false)}} className={`w-full text-left p-3 rounded-lg text-base font-bold transition-all ${activeTab === 'reports' ? 'bg-[#F2C4CE]/10 text-[#F2C4CE] border border-[#F2C4CE]/20' : 'text-gray-400 hover:bg-white/5'}`}>REPORTS</button>}
          {['Manager', 'SuperAdmin'].includes(user.role) && (
            <button onClick={() => {setActiveTab('users'); setIsSidebarOpen(false)}} className={`w-full text-left p-3 rounded-lg text-base font-bold transition-all ${activeTab === 'users' ? 'bg-[#F2C4CE]/10 text-[#F2C4CE] border border-[#F2C4CE]/20' : 'text-gray-400 hover:bg-white/5'}`}>PERSONNEL</button>
          )}
        </nav>

        <div className="border-t border-[#5A595E]/30 p-4">
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_40px_rgba(0,0,0,0.18)]">
            <div className="h-1 w-full bg-[linear-gradient(90deg,rgba(242,196,206,0.75),rgba(245,143,124,0.55),rgba(120,220,140,0.45))]" />
            <div className="p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${user.role === 'SuperAdmin' ? 'bg-[#F58F7C]/18 text-[#F7AA9A]' : user.role === 'Manager' ? 'bg-[#F2C4CE]/18 text-[#F2C4CE]' : user.role === 'Accountant' ? 'bg-[#93C5FD]/18 text-[#BFDBFE]' : user.role === 'Supplier' ? 'bg-[#78DC8C]/15 text-[#9AE8AA]' : 'bg-white/8 text-gray-400'}`}>
                    {user.role}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[12px] text-gray-400">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#78DC8C] shadow-[0_0_10px_rgba(120,220,140,0.65)]" />
                    Active
                  </span>
                </div>
                <p className="mt-4 truncate text-[16px] font-bold leading-tight text-white">{user.name}</p>
                <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-black/10 px-3 py-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500">Session</p>
                    <p className="mt-1 text-[13px] text-gray-300">Enabled</p>
                  </div>
                  <button onClick={handleLogout} className="inline-flex shrink-0 items-center justify-center rounded-xl border border-[#F58F7C]/20 bg-[#F58F7C]/10 px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.12em] text-[#F6B1A1] transition hover:border-[#F58F7C]/35 hover:bg-[#F58F7C]/16 hover:text-white">
                    Logout
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col z-10 h-screen overflow-y-auto custom-scrollbar">
        <header className="h-16 border-b border-[#5A595E] grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-8 bg-[#2C2B30]/60 backdrop-blur-md sticky top-0 z-20">
          <button className="md:hidden p-2 text-gray-400" onClick={() => setIsSidebarOpen(true)}><Menu size={24}/></button>
          <div className="hidden sm:flex items-center min-w-0">
            {activeTab === 'inventory' && ['Manager', 'SuperAdmin'].includes(user.role) ? (
              <div className="relative w-full max-w-[520px]">
                <input type="text" placeholder="Search product or SKU..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-[#232226] border border-[#5A595E] rounded-full h-10 px-10 text-base outline-none focus:border-[#F2C4CE] transition-all" />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 transition-colors"><SearchIcon /></span>
              </div>
            ) : (
              <div className="h-10 w-full max-w-[520px]" />
            )}
          </div>

          <div className="flex gap-4 items-center">
            {user.role !== 'Supplier' && (
              <button ref={notificationsButtonRef} onClick={() => setShowNotifications(!showNotifications)} className="relative p-2 text-gray-400 hover:text-[#F2C4CE] transition">
                <BellIcon />
                {(lowStockAlerts.length + pendingOutbound.length) > 0 && (
                  <span className="absolute top-0 right-0 bg-[#F2C4CE] text-[#2C2B30] text-[14px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-[0_0_8px_#F2C4CE]">
                    {lowStockAlerts.length + pendingOutbound.length}
                  </span>
                )}
              </button>
            )}
            {canManageProducts && <button onClick={() => { resetProductForm(); setShowProductModal(true); }} className="text-[13px] border border-[#F58F7C] text-[#F58F7C] px-4 py-2 rounded font-bold uppercase hover:bg-[#F58F7C]/10 transition">NEW PRODUCT</button>}
            {canManageOrders && <button onClick={() => openNewOrderModal()} className="text-[13px] bg-[#F2C4CE] text-[#2C2B30] px-4 py-2 rounded font-bold uppercase hover:brightness-110 transition">NEW ORDER</button>}
            <button onClick={loadData} className="text-[13px] border border-[#5A595E] text-white px-4 py-2 rounded font-bold uppercase hover:bg-white/5">SYNC DB</button>
          </div>
        </header>

        {showNotifications && (
          <div ref={notificationsPanelRef} className="absolute right-8 top-20 w-80 overflow-hidden rounded-3xl border border-white/10 bg-[#2E2D31]/95 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl z-[150]">
            <div className="border-b border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] px-5 py-4">
              <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-[#F2C4CE]">Alert Center</p>
              <p className="mt-1 text-[13px] text-gray-500">Priority updates for stock and fulfillment.</p>
            </div>
            <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
              <div className="border-b border-white/5 bg-[linear-gradient(180deg,rgba(245,143,124,0.06),rgba(245,143,124,0.02))] p-5">
                <p className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-[#F5A28F]">Supply Side Restock</p>
                {lowStockAlerts.length === 0 && <p className="text-[13px] text-gray-500 italic">Inventory stable.</p>}
                {lowStockAlerts.map(p => (
                  <div key={p._id} className="mb-3 rounded-2xl border border-[#F58F7C]/18 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(245,143,124,0.06))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] last:mb-0">
                    <p className="text-[13px] font-bold leading-relaxed text-[#F6B1A1]">{p.name} critical!</p>
                    {canManageOrders && (canSupplierRestock || canRequestTransfer) && <button onClick={() => openNewOrderModal({ product: p._id, orderType: canSupplierRestock ? 'Inbound' : 'Transfer' })} className="mt-3 rounded-full border border-[#F5A28F]/35 bg-[#F58F7C]/10 px-3 py-1.5 text-[14px] font-bold uppercase tracking-[0.12em] text-[#F7C0B4] transition hover:bg-[#F58F7C]/18 hover:text-white">{canSupplierRestock ? 'Restock Form' : 'Stock Transfer'}</button>}
                  </div>
                ))}
              </div>
              <div className="bg-[linear-gradient(180deg,rgba(120,220,140,0.05),rgba(120,220,140,0.02))] p-5">
                <p className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-[#92E2A1]">Customer Fulfillment</p>
                {pendingOutbound.length === 0 && <p className="text-[13px] text-gray-500 italic">No shipments pending.</p>}
                {pendingOutbound.map(o => (
                  <div key={o._id} className="mb-3 rounded-2xl border border-[#78DC8C]/16 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(120,220,140,0.05))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] last:mb-0">
                    <p className="text-[13px] font-bold leading-relaxed text-[#AAE8B3]">Order for: {o.product?.name}</p>
                    {canManageOrders ? (
                      <div className="mt-2 flex gap-2">
                        <button onClick={() => handleDeliver(o._id, 'Outbound')} className="rounded-full border border-[#78DC8C]/30 bg-[#78DC8C]/10 px-3 py-1.5 text-[14px] font-bold uppercase tracking-[0.12em] text-[#B8F0C1] transition hover:bg-[#78DC8C]/18 hover:text-white">Confirm Delivery</button>
                        <button onClick={() => handleCancelOrder(o._id)} className="rounded-full border border-[#F5A28F]/25 bg-[#F58F7C]/8 px-3 py-1.5 text-[14px] font-bold uppercase tracking-[0.12em] text-[#EAB0A3] transition hover:bg-[#F58F7C]/16 hover:text-white">Cancel</button>
                      </div>
                    ) : (
                      <p className="mt-2 text-[14px] uppercase tracking-[0.12em] text-gray-500">Pending review</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="p-8">
          {activeTab === 'inventory' && user.role === 'Supplier' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <div className="rounded-2xl border border-[#5A595E] bg-[#36353A]/40 p-6 shadow-2xl">
                  <div className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#F2C4CE]">Supplier Dashboard</div>
                  <div className="mt-3 text-2xl font-bold text-white">{supplierProfile?.name || user.supplierName || user.name}</div>
                  <div className="mt-2 text-[13px] text-gray-400">{supplierProfile?.email || user.email}</div>
                  <div className="mt-1 text-[13px] text-gray-500">{supplierProfile?.contactPerson || 'Supplier contact account'}</div>
                </div>
                <div className="rounded-2xl border border-[#5A595E] bg-[#36353A]/40 p-6 shadow-2xl">
                  <div className="text-[13px] font-bold uppercase tracking-[0.12em] text-gray-500">Pending Orders</div>
                  <div className="mt-3 text-3xl font-bold text-white">{supplierPendingOrders}</div>
                  <div className="mt-2 text-[13px] text-gray-400">Orders currently awaiting completion.</div>
                </div>
                <div className="rounded-2xl border border-[#5A595E] bg-[#36353A]/40 p-6 shadow-2xl">
                  <div className="text-[13px] font-bold uppercase tracking-[0.12em] text-gray-500">Awaiting Signature</div>
                  <div className="mt-3 text-3xl font-bold text-[#F7C0B4]">{supplierAwaitingSignatureOrders}</div>
                  <div className="mt-2 text-[13px] text-gray-400">Purchase orders waiting on supplier confirmation.</div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-[#5A595E] bg-[#36353A]/40 p-6 shadow-2xl">
                  <div className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#F2C4CE]">Order Summary</div>
                  <div className="mt-5 space-y-3 text-[14px]">
                    <div className="flex items-center justify-between rounded-xl border border-white/8 bg-black/10 px-4 py-3">
                      <span className="text-gray-500 uppercase font-bold">Completed</span>
                      <span className="font-bold text-[#78DC8C]">{supplierCompletedOrders}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-white/8 bg-black/10 px-4 py-3">
                      <span className="text-gray-500 uppercase font-bold">Payment Methods</span>
                      <span className="font-bold text-white">{supplierProfile?.paymentMethods?.length || 0}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#5A595E] bg-[#36353A]/40 p-6 shadow-2xl">
                  <div className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#F2C4CE]">Company Reference</div>
                  <div className="mt-5 space-y-3 text-[14px] text-gray-300">
                    <div><span className="text-gray-500 uppercase font-bold">Company</span><div className="mt-1 font-bold text-white">Lumiere Corporation</div></div>
                    <div><span className="text-gray-500 uppercase font-bold">Supplier Email</span><div className="mt-1">{supplierProfile?.email || user.email}</div></div>
                    <div><span className="text-gray-500 uppercase font-bold">Address</span><div className="mt-1">{supplierProfile?.address || 'No address provided.'}</div></div>
                  </div>
                </div>
              </div>

            </div>
          )}

          {activeTab === 'inventory' && user.role === 'Accountant' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <div className="rounded-2xl border border-[#5A595E] bg-[#36353A]/40 p-6 shadow-2xl">
                  <div className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#F2C4CE]">Accountant Dashboard</div>
                  <div className="mt-3 text-2xl font-bold text-white">{user.name}</div>
                  <div className="mt-2 text-[14px] text-gray-400">{user.email}</div>
                  <div className="mt-2 text-[14px] text-gray-500">Expense monitoring access enabled.</div>
                </div>
                <div className="rounded-2xl border border-[#5A595E] bg-[#36353A]/40 p-6 shadow-2xl">
                  <div className="text-[13px] font-bold uppercase tracking-[0.12em] text-gray-500">Accounts Payable</div>
                  <div className="mt-3 text-3xl font-bold text-[#F7C0B4]">{formatCurrency(accountsPayableTotal)}</div>
                  <div className="mt-2 text-[14px] text-gray-400">Completed supplier orders awaiting payment.</div>
                </div>
                <div className="rounded-2xl border border-[#5A595E] bg-[#36353A]/40 p-6 shadow-2xl">
                  <div className="text-[13px] font-bold uppercase tracking-[0.12em] text-gray-500">Accounts Receivable</div>
                  <div className="mt-3 text-3xl font-bold text-[#78DC8C]">{formatCurrency(accountsReceivableTotal)}</div>
                  <div className="mt-2 text-[14px] text-gray-400">Customer sales awaiting collection.</div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="rounded-2xl border border-[#5A595E] bg-[#36353A]/40 p-6 shadow-2xl">
                  <div className="text-[13px] font-bold uppercase tracking-[0.12em] text-gray-500">Disbursements</div>
                  <div className="mt-3 text-3xl font-bold text-white">{formatCurrency(disbursementTotal)}</div>
                  <div className="mt-2 text-[14px] text-gray-400">Supplier payments already released.</div>
                </div>
                <div className="rounded-2xl border border-[#5A595E] bg-[#36353A]/40 p-6 shadow-2xl">
                  <div className="text-[13px] font-bold uppercase tracking-[0.12em] text-gray-500">Collections</div>
                  <div className="mt-3 text-3xl font-bold text-white">{formatCurrency(collectionsTotal)}</div>
                  <div className="mt-2 text-[14px] text-gray-400">Customer receipts already collected.</div>
                </div>
                <div className="rounded-2xl border border-[#5A595E] bg-[#36353A]/40 p-6 shadow-2xl">
                  <div className="text-[13px] font-bold uppercase tracking-[0.12em] text-gray-500">Ledger Rows</div>
                  <div className="mt-3 text-3xl font-bold text-white">{visibleAccountingOrders.length}</div>
                  <div className="mt-2 text-[14px] text-gray-400">Active payables and receivables only.</div>
                </div>
              </div>

              <div className="rounded-2xl border border-[#5A595E] bg-[#36353A]/40 p-6 shadow-2xl">
                <div className="flex flex-col gap-2 border-b border-white/8 pb-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#F2C4CE]">Recent Accounting Entries</div>
                    <p className="mt-2 text-[14px] leading-7 text-gray-400">Latest supplier payables and customer receivables requiring accounting follow-up.</p>
                  </div>
                  <button onClick={() => { setExpenseSubTab('payables'); setActiveTab('expenses'); }} className="rounded-lg border border-[#F58F7C]/30 bg-[#F58F7C]/10 px-5 py-3 text-[13px] font-bold uppercase tracking-[0.12em] text-[#F6B1A1] transition hover:bg-[#F58F7C]/16 hover:text-white">
                    Open Payables
                  </button>
                </div>
                <div className="mt-5 overflow-hidden rounded-2xl border border-[#5A595E] bg-black/10">
                  <table className="w-full text-left text-[15px]">
                    <thead className="bg-[#232226] border-b border-[#5A595E] text-gray-500 uppercase">
                      <tr>
                        <th className="p-4">Date</th>
                        <th className="p-4">Party</th>
                        <th className="p-4">Product</th>
                        <th className="p-4">Entry</th>
                        <th className="p-4">Amount</th>
                        <th className="p-4">State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleAccountingOrders.slice(0, 6).map((order) => (
                        <tr key={order._id} className="border-b border-white/5">
                          <td className="p-4 text-gray-400">{new Date(order.createdAt).toLocaleDateString()}</td>
                          <td className="p-4">
                            <div className="font-bold text-white">{order.orderType === 'Inbound' ? (order.supplier?.name || 'No supplier') : 'Customer Sale'}</div>
                            {order.orderType === 'Inbound' && (
                              <div className="mt-1 text-[12px] text-gray-500">
                                {getOrderAccountingPaymentMethodSummary(order)}
                              </div>
                            )}
                          </td>
                          <td className="p-4 text-gray-300">{order.product?.name || 'No product'}</td>
                          <td className="p-4 text-[#F2C4CE] font-bold">{order.accountingTerm}</td>
                          <td className="p-4 font-bold text-[#F7C0B4]">{formatCurrency(order.orderType === 'Inbound' ? order.expenseAmount : order.receivableAmount)}</td>
                          <td className="p-4"><span className={`inline-flex rounded-full px-3 py-1 text-[12px] font-bold uppercase tracking-[0.12em] ${order.accountingSettlementStatus === 'Settled' ? 'bg-[#78DC8C]/15 text-[#9AE8AA]' : 'bg-[#F2C4CE]/15 text-[#F2C4CE]'}`}>{order.accountingSettlementStatus === 'Settled' ? order.accountingTerm : 'Open'}</span></td>
                        </tr>
                      ))}
                      {visibleAccountingOrders.length === 0 && (
                        <tr>
                          <td colSpan="5" className="p-6 text-center text-[14px] text-gray-500">No supplier expenses recorded yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'supplierProducts' && user.role === 'Supplier' && (
            <div className="rounded-2xl border border-[#5A595E] bg-[#36353A]/40 p-6 shadow-2xl">
              <div className="flex flex-col gap-2 border-b border-white/8 pb-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#F2C4CE]">Supplier Products</div>
                  <p className="mt-2 text-[13px] text-gray-500">Link the products your supplier carries, then set your supplier price for each linked item.</p>
                </div>
                <div className="text-[12px] font-bold uppercase tracking-[0.12em] text-gray-500">{supplierLinkedProducts.length} linked item{supplierLinkedProducts.length === 1 ? '' : 's'}</div>
              </div>

              {supplierProductCatalog.length > 0 ? (
                <div className="mt-5">
                  <div className="overflow-hidden rounded-2xl border border-[#5A595E] bg-black/10">
                    <table className="w-full text-left text-[14px]">
                      <thead className="bg-[#232226] border-b border-[#5A595E] text-gray-500 uppercase">
                        <tr>
                          <th className="p-4">Product</th>
                          <th className="p-4">SKU</th>
                          <th className="p-4">Selling Price</th>
                          <th className="p-4">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {supplierProductCatalog.map((product) => {
                          const isLinked = (product.suppliers || []).some((supplier) => String(supplier?._id || supplier) === currentSupplierId);
                          const supplierPriceEntry = getSupplierCostEntry(product, currentSupplierId);
                          const isSelected = selectedSupplierProductId === product._id;

                          return (
                            <tr
                              key={product._id}
                              onClick={() => setSelectedSupplierProductId(product._id)}
                              className={`cursor-pointer border-b border-white/5 transition ${isSelected ? 'bg-white/8' : 'hover:bg-white/5'}`}
                            >
                              <td className="p-4 font-bold text-white">{product.name}</td>
                              <td className="p-4 font-mono text-[#F58F7C]">{product.sku}</td>
                              <td className="p-4 text-white">{formatCurrency(product.price)}</td>
                              <td className="p-4">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${isLinked ? 'bg-[#F2C4CE]/18 text-[#F2C4CE]' : 'bg-white/8 text-gray-400'}`}>
                                    {isLinked ? 'Linked' : 'Not Linked'}
                                  </span>
                                  {supplierPriceEntry && (
                                    <span className="text-[12px] text-gray-400">
                                      {`Supplier price ${formatCurrency(supplierPriceEntry.cost)}`}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-white/8 bg-black/10 px-4 py-6 text-center text-[13px] text-gray-500">
                  No products are available yet.
                </div>
              )}

              {selectedSupplierProduct && (() => {
                const isLinked = (selectedSupplierProduct.suppliers || []).some((supplier) => String(supplier?._id || supplier) === currentSupplierId);
                const supplierPriceEntry = getSupplierCostEntry(selectedSupplierProduct, currentSupplierId);
                const cheapestQuote = getCheapestSupplierQuote(selectedSupplierProduct);
                const draftValue = Object.prototype.hasOwnProperty.call(supplierOwnCostDrafts, selectedSupplierProduct._id)
                  ? supplierOwnCostDrafts[selectedSupplierProduct._id]
                  : (supplierPriceEntry ? String(supplierPriceEntry.cost) : '');
                const isSavingPrice = supplierOwnCostUpdateId === selectedSupplierProduct._id;
                const isLinkUpdating = supplierOwnCostUpdateId === `link:${selectedSupplierProduct._id}`;
                const margin = supplierPriceEntry ? selectedSupplierProduct.price - supplierPriceEntry.cost : null;
                const isCheapestSupplier = cheapestQuote?.supplierId === currentSupplierId && supplierPriceEntry;

                return (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setSelectedSupplierProductId(null)}>
                    <div className="w-full max-w-2xl rounded-2xl border border-[#F2C4CE]/20 bg-[#36353A] p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                      <div className="space-y-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[12px] font-bold uppercase tracking-[0.12em] text-gray-500">Item Details</div>
                            <h3 className="mt-2 text-lg font-bold leading-tight text-white">{selectedSupplierProduct.name}</h3>
                            <div className="mt-1 text-[13px] text-gray-400">SKU: {selectedSupplierProduct.sku}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            {isCheapestSupplier && (
                              <span className="inline-flex rounded-full bg-[#78DC8C]/12 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#78DC8C]">
                                Cheapest
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => setSelectedSupplierProductId(null)}
                              className="inline-flex min-h-9 items-center justify-center rounded-full border border-white/10 px-4 py-2 text-[12px] font-bold uppercase tracking-[0.12em] text-gray-400 transition hover:border-white/20 hover:text-white"
                            >
                              Close
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2 text-[13px] text-gray-300">
                          <div className="flex justify-between border-b border-white/5 pb-2"><span className="font-bold uppercase text-gray-500">Selling Price</span><span className="text-white">{formatCurrency(selectedSupplierProduct.price)}</span></div>
                          <div className="flex justify-between border-b border-white/5 pb-2"><span className="font-bold uppercase text-gray-500">Status</span><span className={isLinked ? 'text-[#F2C4CE] font-bold' : 'text-gray-400 font-bold'}>{isLinked ? 'Linked' : 'Not Linked'}</span></div>
                          <div className="flex justify-between border-b border-white/5 pb-2"><span className="font-bold uppercase text-gray-500">Supplier Price</span><span className="text-white">{supplierPriceEntry ? formatCurrency(supplierPriceEntry.cost) : 'Not set'}</span></div>
                          <div className="flex justify-between"><span className="font-bold uppercase text-gray-500">Margin</span><span className={margin !== null ? 'text-[#78DC8C] font-bold' : 'text-gray-400'}>{margin !== null ? formatCurrency(margin) : 'Not set'}</span></div>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleSupplierProductLink(selectedSupplierProduct)}
                          disabled={isLinkUpdating}
                          className={`w-full rounded-lg px-4 py-3 text-[12px] font-bold uppercase tracking-[0.12em] transition ${isLinked ? 'border border-[#F2C4CE]/35 bg-[#F2C4CE]/10 text-[#F2C4CE] hover:bg-[#F2C4CE]/18 hover:text-white' : 'border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white'} disabled:cursor-not-allowed disabled:opacity-60`}
                        >
                          {isLinkUpdating ? 'Saving' : isLinked ? 'Unlink Product' : 'Link Product'}
                        </button>

                        {isLinked && (
                          <div className="grid gap-3">
                            <div className="space-y-1">
                              <label className="text-[12px] font-bold uppercase tracking-[0.12em] text-gray-500">Your Supplier Price</label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                inputMode="decimal"
                                value={draftValue}
                                onChange={(e) => handleSupplierOwnCostDraftChange(selectedSupplierProduct._id, e.target.value)}
                                className="no-number-spinner w-full rounded-lg border border-[#5A595E] bg-[#232226] p-3 text-base text-white outline-none"
                                placeholder="0.00"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => saveSupplierOwnProductCost(selectedSupplierProduct._id)}
                              disabled={isSavingPrice || draftValue === ''}
                              className="rounded-lg border border-[#F58F7C]/35 bg-[#F58F7C]/10 px-4 py-3 text-[12px] font-bold uppercase tracking-[0.12em] text-[#F7C0B4] transition hover:bg-[#F58F7C]/18 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isSavingPrice ? 'Saving' : 'Save Supplier Price'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {activeTab === 'inventory' && ['Manager', 'SuperAdmin'].includes(user.role) && (
            <div className="space-y-8">
              <div className="h-12 flex items-center overflow-x-auto custom-scrollbar">
                <div className="flex gap-2">
                  {categories.map(cat => (
                    <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-4 py-1.5 rounded-full text-[13px] font-bold border transition-all whitespace-nowrap ${selectedCategory === cat ? 'bg-[#F2C4CE] text-[#2C2B30] border-[#F2C4CE]' : 'border-[#5A595E] text-gray-500 hover:border-gray-400'}`}>
                      {cat.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-6 items-start">
                <div className="bg-[#36353A]/40 border border-[#5A595E] rounded-xl overflow-hidden shadow-2xl">
                  <table className="w-full text-left text-[14px]">
                    <thead className="bg-[#232226] border-b border-[#5A595E] text-gray-500 uppercase">
                      <tr>
                        <th className="p-4">Product</th>
                        <th className="p-4">Category</th>
                        <th className="p-4">SKU</th>
                        <th className="p-4">Unit Price</th>
                        <th className="p-4">Stock</th>
                        <th className="p-4">Status</th>
                        {canManageProducts && <th className="p-4 text-right">Action</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.map((p) => (
                        <tr
                          key={p._id}
                          onClick={() => setSelectedInventoryProductId(p._id)}
                          className={`cursor-pointer border-b border-white/5 transition ${selectedInventoryProductId === p._id ? 'bg-white/8' : 'hover:bg-white/5'}`}
                        >
                          <td className="p-4 font-bold text-white">{p.name}</td>
                          <td className="p-4 text-gray-400">{p.category}</td>
                          <td className="p-4 font-mono text-[#F58F7C]">{p.sku}</td>
                          <td className="p-4 text-white">{formatCurrency(p.price)}</td>
                          <td className={`p-4 font-bold ${getUnitColor(p.totalStock, p.isLowStock)}`}>{p.totalStock} {p.unitOfMeasure || 'unit'}</td>
                          <td className="p-4">
                            {p.totalStock <= 0 ? (
                              <span className="inline-flex rounded-full bg-red-500 px-2 py-1 text-[14px] font-black text-white">OUT</span>
                            ) : p.isLowStock ? (
                              <span className="inline-flex rounded-full bg-amber-300 px-2 py-1 text-[14px] font-black text-[#2C2B30]">LOW</span>
                            ) : (
                              <span className="inline-flex rounded-full bg-[#78DC8C]/15 px-2 py-1 text-[14px] font-black text-[#78DC8C]">OK</span>
                            )}
                          </td>
                          {canManageProducts && (
                            <td className="p-4 text-right">
                              <div className="flex justify-end gap-3">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    startEditingProduct(p);
                                  }}
                                  className="text-[#F2C4CE] hover:text-white font-bold uppercase underline text-[12px] transition-colors"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleDeleteProduct(p);
                                  }}
                                  className="text-[#F58F7C] hover:text-red-400 font-bold uppercase underline text-[12px] transition-colors"
                                >
                                  Remove
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                      {filteredProducts.length === 0 && (
                        <tr>
                          <td colSpan={canManageProducts ? 7 : 6} className="p-6 text-center text-[13px] text-gray-500">No products matched the current filters.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className={selectedInventoryProduct ? "fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" : "hidden"} onClick={() => setSelectedInventoryProductId(null)}>
                  {selectedInventoryProduct ? (
                    <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[#5A595E] bg-[#36353A] p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                      <div className="space-y-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-gray-500">{selectedInventoryProduct.category}</p>
                          <h3 className="mt-2 text-lg font-bold leading-tight text-white sm:pr-4">{selectedInventoryProduct.name}</h3>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                          {selectedInventoryProduct.isLowStock && (
                            <span className={`rounded-full px-3 py-1 text-[14px] font-black ${selectedInventoryProduct.totalStock <= 0 ? 'bg-red-500 text-white' : 'bg-amber-300 text-[#2C2B30]'}`}>
                              {selectedInventoryProduct.totalStock <= 0 ? 'OUT OF STOCK' : 'LOW STOCK'}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => setSelectedInventoryProductId(null)}
                            className="inline-flex min-h-9 items-center justify-center rounded-full border border-white/10 px-4 py-2 text-[13px] font-bold uppercase tracking-[0.12em] text-gray-400 transition hover:border-white/20 hover:text-white"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {warehouseNames.map((whName) => {
                          const entry = selectedInventoryProduct.warehouses?.find((warehouse) => warehouse.name === whName);
                          const stock = entry?.stock || 0;
                          return (
                            <div key={whName} className="rounded-lg border border-white/5 bg-black/20 p-3">
                              <div className="text-[14px] font-bold uppercase text-gray-500">{whName}</div>
                              <div className={`mt-1 text-base font-bold ${stock <= 0 ? 'text-red-400' : selectedInventoryProduct.isLowStock ? 'text-amber-400' : 'text-gray-200'}`}>{stock} {selectedInventoryProduct.unitOfMeasure || 'unit'}</div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="space-y-2 text-[13px]">
                        <div className="flex justify-between border-b border-white/5 pb-2"><span className="font-bold uppercase text-gray-500">SKU</span><span className="font-mono text-[#F58F7C]">{selectedInventoryProduct.sku}</span></div>
                        <div className="flex justify-between border-b border-white/5 pb-2"><span className="font-bold uppercase text-gray-500">Unit Price</span><span className="text-white">{formatCurrency(selectedInventoryProduct.price)}</span></div>
                        <div className="flex justify-between border-b border-white/5 pb-2"><span className="font-bold uppercase text-gray-500">Suppliers</span><span className="max-w-[60%] text-right text-gray-300">{formatSupplierNames(selectedInventoryProduct.suppliers)}</span></div>
                        <div className="flex justify-between border-b border-white/5 pb-2"><span className="font-bold uppercase text-gray-500">Best Supplier Cost</span><span className="max-w-[60%] text-right text-gray-300">{getCheapestSupplierQuote(selectedInventoryProduct)?.supplier?.name ? `${getCheapestSupplierQuote(selectedInventoryProduct).supplier.name} - ${formatCurrency(getCheapestSupplierQuote(selectedInventoryProduct).cost)}` : 'Not set'}</span></div>
                        <div className="flex justify-between border-b border-white/5 pb-2"><span className="font-bold uppercase text-gray-500">Low Stock Threshold</span><span className="text-gray-300">{selectedInventoryProduct.reorderThreshold} {selectedInventoryProduct.unitOfMeasure || 'unit'}</span></div>
                        <div className="flex justify-between"><span className="font-bold uppercase text-gray-500">Total Stock</span><span className={`font-bold ${getUnitColor(selectedInventoryProduct.totalStock, selectedInventoryProduct.isLowStock)}`}>{selectedInventoryProduct.totalStock} {selectedInventoryProduct.unitOfMeasure || 'unit'}</span></div>
                      </div>
                      {canManageProducts && (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => startEditingProduct(selectedInventoryProduct)}
                            className="rounded-lg border border-[#F2C4CE]/35 bg-[#F2C4CE]/10 px-4 py-3 text-[13px] font-bold uppercase tracking-[0.12em] text-[#F2C4CE] transition hover:bg-[#F2C4CE]/18 hover:text-white"
                          >
                            Edit Product
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteProduct(selectedInventoryProduct)}
                            className="rounded-lg border border-[#F58F7C]/35 bg-[#F58F7C]/10 px-4 py-3 text-[13px] font-bold uppercase tracking-[0.12em] text-[#F7C0B4] transition hover:bg-[#F58F7C]/18 hover:text-white"
                          >
                            Remove Product
                          </button>
                        </div>
                      )}
                      {canManageOrders && (canSupplierRestock || canRequestTransfer) && (
                        <button onClick={() => openNewOrderModal({ product: selectedInventoryProduct._id, orderType: canSupplierRestock ? 'Inbound' : 'Transfer' })} className="w-full rounded-lg border border-[#F5A28F]/35 bg-[#F58F7C]/10 px-4 py-3 text-[13px] font-bold uppercase tracking-[0.12em] text-[#F7C0B4] transition hover:bg-[#F58F7C]/18 hover:text-white">
                          {canSupplierRestock ? 'Restock Form' : 'Stock Transfer'}
                        </button>
                      )}
                      </div>
                    </div>
                  ) : (
                    <div className="py-16 text-center text-[13px] uppercase tracking-[0.12em] text-gray-500">
                      Select a product to view details.
                    </div>
                  )}
                </div>
                {false && filteredProducts.map(p => (
                  <div key={p._id} className={`p-6 rounded-xl border bg-[#36353A]/40 backdrop-blur-sm transition-all duration-500 flex flex-col justify-between min-h-[240px] ${getCardStyle(p.totalStock, p.isLowStock)}`}>
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="font-bold text-white text-base pr-4">{p.name}</h3>
                      {p.isLowStock && <span className={`text-[14px] px-2 py-1 rounded font-black whitespace-nowrap ${p.totalStock <= 0 ? 'bg-red-500 text-white shadow-[0_0_8px_rgba(239,68,68,0.35)]' : 'bg-amber-300 text-[#2C2B30] shadow-[0_0_8px_rgba(251,191,36,0.35)]'}`}>LOW STOCK</span>}
                    </div>

                    <div className="mb-4 grid grid-cols-2 gap-2">
                      {warehouseNames.map(whName => {
                        const entry = p.warehouses?.find(w => w.name === whName);
                        const currentStock = entry ? entry.stock : 0;
                        return (
                          <div key={whName} className="bg-black/20 p-2 rounded border border-white/5">
                            <p className="text-[14px] text-gray-500 uppercase font-bold">{whName}</p>
                            <p className={`text-[13px] font-bold ${currentStock <= 0 ? 'text-red-400' : p.isLowStock ? 'text-amber-400' : 'text-gray-300'}`}>{currentStock} {p.unitOfMeasure || 'unit'}</p>
                          </div>
                        );
                      })}
                    </div>

                    <div className="space-y-2 text-[13px]">
                      <div className="flex justify-between border-b border-white/5 pb-1"><span className="text-gray-500 uppercase font-bold">SKU</span><span className="text-[#F58F7C] font-mono">{p.sku}</span></div>
                      <div className="flex justify-between border-b border-white/5 pb-1"><span className="text-gray-500 uppercase font-bold">Unit Price</span><span className="text-white">{formatCurrency(p.price)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500 uppercase font-bold">Stock Level</span><span className={`font-bold ${getUnitColor(p.totalStock, p.isLowStock)}`}>{p.totalStock} {p.unitOfMeasure || 'unit'}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'orders' && (
            <div className="bg-[#36353A]/40 border border-[#5A595E] rounded-xl overflow-hidden shadow-2xl">
              <div className="border-b border-[#5A595E] bg-[#232226] p-4">
                <div className="space-y-4">
                  <span className="text-[13px] font-bold uppercase text-[#F2C4CE] tracking-[0.12em]">Logs</span>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500">Date/Time</label>
                      <input value={logDateFilter} onChange={(e) => setLogDateFilter(e.target.value)} placeholder="Filter date/time" className="w-full rounded border border-[#5A595E] bg-[#2C2B30] px-3 py-2 text-[13px] text-white placeholder:text-gray-500" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500">Requester</label>
                      <input value={logRequesterFilter} onChange={(e) => setLogRequesterFilter(e.target.value)} placeholder="Filter requester" className="w-full rounded border border-[#5A595E] bg-[#2C2B30] px-3 py-2 text-[13px] text-white placeholder:text-gray-500" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500">Product</label>
                      <input value={logProductFilter} onChange={(e) => setLogProductFilter(e.target.value)} placeholder="Filter product" className="w-full rounded border border-[#5A595E] bg-[#2C2B30] px-3 py-2 text-[13px] text-white placeholder:text-gray-500" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500">Type</label>
                      <select value={logTypeFilter} onChange={(e) => setLogTypeFilter(e.target.value)} className="w-full rounded border border-[#5A595E] bg-[#2C2B30] px-3 py-2 text-[13px] text-white">
                        <option value="All">All Types</option>
                        <option value="Inbound">Inbound</option>
                        <option value="Transfer Request">Transfer Request</option>
                        <option value="Outbound">Outbound</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500">{transferLogColumnLabel}</label>
                      <input value={logWarehouseFilter} onChange={(e) => setLogWarehouseFilter(e.target.value)} placeholder={`Filter ${transferLogColumnLabel.toLowerCase()}`} className="w-full rounded border border-[#5A595E] bg-[#2C2B30] px-3 py-2 text-[13px] text-white placeholder:text-gray-500" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500">Status</label>
                      <select value={logStatusFilter} onChange={(e) => setLogStatusFilter(e.target.value)} className="w-full rounded border border-[#5A595E] bg-[#2C2B30] px-3 py-2 text-[13px] text-white">
                        <option value="All">All Statuses</option>
                        <option value="Cancelled">Cancelled</option>
                        <option value="Order Received">Order Received</option>
                        <option value="Preparing Purchase Order">Preparing Purchase Order</option>
                        <option value="Awaiting Warehouse Manager Signature">Awaiting Warehouse Manager Signature</option>
                        <option value="Awaiting CEO Signature">Awaiting CEO Signature</option>
                        <option value="Preparing Transfer">Preparing Transfer</option>
                        <option value="Awaiting Requester">Awaiting Requester</option>
                        <option value="Awaiting Source">Awaiting Source</option>
                        <option value="Ready To Receive">Ready To Receive</option>
                        <option value="Transfer Completed">Transfer Completed</option>
                        <option value="Pending">Pending</option>
                        <option value="Shipped">Shipped</option>
                        <option value="Delivered">Delivered</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500">Action</label>
                      <select value={logActionFilter} onChange={(e) => setLogActionFilter(e.target.value)} className="w-full rounded border border-[#5A595E] bg-[#2C2B30] px-3 py-2 text-[13px] text-white">
                        <option value="All">All Actions</option>
                        <option value="Sign">Sign</option>
                        <option value="Order Receive">Order Receive</option>
                        <option value="Transfer Receive">Transfer Receive</option>
                        <option value="Deliver">Deliver</option>
                        <option value="Completed">Completed</option>
                        <option value="Cancelled">Cancelled</option>
                        <option value="View Status">View Status</option>
                        <option value="Cancel">Cancel</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <table className="w-full text-left text-[14px]">
                  <thead className="bg-black/20 text-gray-500 uppercase border-b border-[#5A595E]">
                        <tr><th className="p-4">Date/Time</th><th className="p-4">Requester</th><th className="p-4">Product</th><th className="p-4">Type</th><th className="p-4">{transferLogColumnLabel}</th><th className="p-4">Status</th><th className="p-4 text-right">Action</th></tr>
                  </thead>
                  <tbody>
                    {filteredManagerLogs.map(o => {
                      const actor = getOrderActor(o);
                      const isPurchaseOrderOpenable = canOpenPurchaseOrder(o);
                      const isTransferOrderOpenable = canOpenTransferOrder(o);
                      const isOrderDocumentOpenable = isPurchaseOrderOpenable || isTransferOrderOpenable;
                      return (
                      <tr
                        key={o._id}
                        onClick={() => {
                          if (isPurchaseOrderOpenable) {
                            openPurchaseOrderModal(o);
                          } else if (isTransferOrderOpenable) {
                            openTransferOrderModal(o);
                          }
                        }}
                        className={`border-b border-white/5 transition ${isOrderDocumentOpenable ? 'cursor-pointer hover:bg-white/5' : 'hover:bg-white/5'}`}
                      >
                        <td className="p-4 text-gray-500 text-[12px]">{new Date(o.createdAt).toLocaleString()}</td>
                        <td className="p-4">
                          <div className="font-bold text-white">{actor.name}</div>
                          <div className={`text-[12px] uppercase font-black ${['Manager', 'SuperAdmin'].includes(actor.role) ? 'text-[#F2C4CE]' : actor.role === 'Staff' ? 'text-[#78DC8C]' : 'text-gray-500'}`}>{actor.role}</div>
                        </td>
                        <td className="p-4 font-bold">{o.product?.name || "N/A"}</td>
                        <td className="p-4 text-gray-400">{o.orderType === 'Transfer' ? 'Transfer Request' : o.orderType}</td>
                        <td className="p-4">
                          {o.orderType === 'Transfer' ? (
                            <span className="font-bold text-[#F2C4CE]">{isWarehouseAManager || user?.role === 'SuperAdmin' ? o.warehouse : o.sourceWarehouse}</span>
                          ) : (
                            <span className="font-bold text-[#F2C4CE]">{o.warehouse}</span>
                          )}
                        </td>
                        <td className="p-4">
                          {o.orderType === 'Inbound' ? (
                            <span className={`text-[12px] font-bold uppercase tracking-[0.12em] ${o.status === 'Cancelled' ? 'text-red-300' : o.status === 'Delivered' ? 'text-green-200' : 'text-[#F7C0B4]'}`}>{getStatusLabel(o)}</span>
                          ) : (
                            <span className={`text-[12px] font-bold uppercase tracking-[0.12em] ${o.status === 'Cancelled' ? 'text-red-300' : o.status === 'Delivered' ? 'text-green-200' : 'text-[#F7C0B4]'}`}>{getStatusLabel(o)}</span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          {o.status === 'Delivered' ? (
                            <span className="inline-flex items-center rounded-full border border-green-400/30 bg-green-400/10 px-3 py-1 text-[#78DC8C] text-[12px] uppercase font-bold">Completed</span>
                          ) : o.status === 'Cancelled' ? (
                            <span className="inline-flex items-center rounded-full border border-red-400/30 bg-red-400/10 px-3 py-1 text-red-300 text-[12px] uppercase font-bold">Cancelled</span>
                          ) : canSupplierSignPurchaseOrder(o) ? (
                            <button onClick={(event) => { event.stopPropagation(); openPurchaseOrderModal(o); }} className="rounded-full border border-[#F2C4CE]/40 bg-[#F2C4CE]/10 px-3 py-1 text-[12px] uppercase font-bold text-[#F2C4CE] hover:bg-[#F2C4CE]/20 hover:text-white transition">Sign</button>
                          ) : !canManageOrderAction(o) ? (
                            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-gray-400 text-[12px] uppercase font-bold">{getStatusLabel(o)}</span>
                          ) : (
                            <div className="flex justify-end gap-2">
                              {o.orderType === 'Inbound' && canSignInboundPurchaseOrder(o) && (
                                <button onClick={(event) => { event.stopPropagation(); openPurchaseOrderModal(o); }} className="rounded-full border border-[#F2C4CE]/40 bg-[#F2C4CE]/10 px-3 py-1 text-[12px] uppercase font-bold text-[#F2C4CE] hover:bg-[#F2C4CE]/20 hover:text-white transition">Sign</button>
                              )}
                              {o.orderType === 'Transfer' && canSignTransferOrder(o) && (
                                <button onClick={(event) => { event.stopPropagation(); openTransferOrderModal(o); }} className="rounded-full border border-[#F2C4CE]/40 bg-[#F2C4CE]/10 px-3 py-1 text-[12px] uppercase font-bold text-[#F2C4CE] hover:bg-[#F2C4CE]/20 hover:text-white transition">Sign</button>
                              )}
                              {((o.orderType === 'Inbound' && canDeliverInboundPurchaseOrder(o)) || (o.orderType === 'Transfer' && canDeliverTransferOrder(o)) || o.orderType === 'Outbound') && (
                                <button onClick={(event) => { event.stopPropagation(); handleDeliver(o._id, o.orderType); }} className="rounded-full border border-[#F2C4CE]/40 bg-[#F2C4CE]/10 px-3 py-1 text-[12px] uppercase font-bold text-[#F2C4CE] hover:bg-[#F2C4CE]/20 hover:text-white transition">{o.orderType === 'Inbound' ? 'Order Receive' : o.orderType === 'Transfer' ? 'Transfer Receive' : 'Deliver'}</button>
                              )}
                              <button onClick={(event) => { event.stopPropagation(); handleCancelOrder(o._id); }} className="rounded-full border border-red-400/40 bg-red-400/10 px-3 py-1 text-[12px] uppercase font-bold text-red-300 hover:bg-red-400/20 hover:text-white transition">Cancel</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )})}
                    {filteredManagerLogs.length === 0 && (
                      <tr>
                        <td colSpan="7" className="p-6 text-center text-[13px] text-gray-500">No logs matched the current filters.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'paymentMethods' && user.role === 'Supplier' && (
            <div className="mx-auto max-w-6xl space-y-6">
              <div className="rounded-2xl border border-[#5A595E] bg-[#36353A]/40 p-8 shadow-2xl">
                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-bold uppercase tracking-[0.12em] text-[#F2C4CE]">Payment Options</h3>
                    <p className="mt-2 text-[14px] leading-7 text-gray-400">Add the bank accounts or e-wallets where Lumiere should send your supplier payouts.</p>
                  </div>
                  <button type="button" onClick={() => openSupplierPaymentMethodModal()} className="rounded-lg border border-[#F58F7C]/30 bg-[#F58F7C]/10 px-5 py-3 text-[13px] font-bold uppercase tracking-[0.12em] text-[#F6B1A1] transition hover:bg-[#F58F7C]/16 hover:text-white">Add Payment Method</button>
                </div>

                <div className="space-y-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-[14px] font-bold uppercase tracking-[0.12em] text-gray-400">Saved Payment Methods</div>
                    <div className="text-[13px] uppercase tracking-[0.12em] text-gray-500">{supplierPaymentMethods.length} saved method{supplierPaymentMethods.length === 1 ? '' : 's'}</div>
                  </div>
                  {supplierPaymentMethods.length > 0 ? (
                    <div className="space-y-4">
                      {supplierPaymentMethods.map((method, index) => (
                        <div key={`supplier-method-${index}`} className="rounded-2xl border border-white/8 bg-black/10 p-5">
                          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-3">
                                <div className="text-lg font-bold text-white">{getSupplierPaymentProviderLabel(method.methodType, method.providerCode)}</div>
                                {method.isPrimary && (
                                  <span className="rounded-full border border-[#78DC8C]/25 bg-[#78DC8C]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#78DC8C]">
                                    Primary
                                  </span>
                                )}
                              </div>
                              <div className="mt-2 text-[14px] leading-7 text-gray-400">
                                <span className="font-bold text-gray-300">{method.methodType === 'ewallet' ? 'E-Wallet' : 'Bank Account'}</span>
                                <span className="mx-2 text-gray-600">•</span>
                                <span>{method.accountName}</span>
                              </div>
                              <div className="mt-1 text-[15px] text-gray-300">{method.accountNumber}</div>
                              {method.notes && <div className="mt-2 text-[14px] leading-7 text-gray-400">{method.notes}</div>}
                            </div>
                            <div className="flex shrink-0 items-center gap-4 self-center">
                              {!method.isPrimary && (
                                <button type="button" onClick={() => setPrimarySupplierPaymentMethod(index)} className="text-[13px] font-bold uppercase tracking-[0.1em] text-[#78DC8C] underline underline-offset-4 transition-colors hover:text-white">Set Primary</button>
                              )}
                              <button type="button" onClick={() => openSupplierPaymentMethodModal(index)} className="text-[13px] font-bold uppercase tracking-[0.1em] text-[#F2C4CE] underline underline-offset-4 transition-colors hover:text-white">Edit</button>
                              <button type="button" onClick={() => removeSupplierPaymentMethod(index)} className="text-[13px] font-bold uppercase tracking-[0.1em] text-[#F58F7C] underline underline-offset-4 transition-colors hover:text-red-400">Remove</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-white/8 bg-black/10 px-6 py-7 text-center text-[14px] leading-7 text-gray-500">
                      No payment methods added yet. Click <span className="font-bold text-gray-300">Add Payment Method</span> to set where Lumiere should send your payouts.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-[#5A595E] bg-[#36353A]/40 p-8 shadow-2xl">
                <h3 className="text-lg font-bold uppercase tracking-[0.12em] text-[#F2C4CE]">Account Security</h3>
                <p className="mt-2 text-[14px] leading-7 text-gray-400">Keep your supplier account secure by setting a new password here.</p>
                <form onSubmit={handleSupplierPasswordSubmit} className="mt-6 grid gap-5 md:grid-cols-2">
                  <div className="space-y-2"><label className="text-[13px] font-bold uppercase tracking-[0.12em] text-gray-400">New Password</label><input type="password" value={supplierPasswordForm.password} onChange={(e) => setSupplierPasswordForm((currentForm) => ({ ...currentForm, password: e.target.value }))} className="w-full rounded-lg border border-[#5A595E] bg-[#232226] p-4 text-[18px] text-white" placeholder="Enter new password" /></div>
                  <div className="space-y-2"><label className="text-[13px] font-bold uppercase tracking-[0.12em] text-gray-400">Confirm Password</label><input type="password" value={supplierPasswordForm.confirmPassword} onChange={(e) => setSupplierPasswordForm((currentForm) => ({ ...currentForm, confirmPassword: e.target.value }))} className="w-full rounded-lg border border-[#5A595E] bg-[#232226] p-4 text-[18px] text-white" placeholder="Confirm new password" /></div>
                  <div className="md:col-span-2"><button type="submit" className="rounded-lg border border-[#F58F7C]/30 bg-[#F58F7C]/10 px-6 py-4 text-[14px] font-bold uppercase tracking-[0.12em] text-[#F6B1A1] transition hover:bg-[#F58F7C]/16 hover:text-white">Update Password</button></div>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'suppliers' && (
            <div className="space-y-8">
              {supplierSubTab === 'network' && (
                  <div className="bg-[#36353A]/40 border border-[#5A595E] rounded-xl overflow-hidden shadow-2xl">
                    <div className="p-4 bg-[#232226] border-b border-[#5A595E] flex items-center justify-between">
                      <span className="text-[13px] font-bold uppercase text-[#F2C4CE] tracking-[0.12em]">Supply Network</span>
                      {user.role === 'SuperAdmin' && <button onClick={() => { resetSupplierForm(); setShowSupplierModal(true); }} className="text-[12px] border border-[#F58F7C] text-[#F58F7C] px-3 py-1 rounded font-bold uppercase hover:bg-[#F58F7C]/10 transition">Add Supplier</button>}
                    </div>
                    <table className="w-full text-left text-[14px]">
                      <thead className="bg-black/20 text-gray-500 uppercase">
                        <tr><th className="p-4">Supplier</th><th className="p-4">Contact</th><th className="p-4">Email</th><th className="p-4">Products</th><th className="p-4">Account</th><th className="p-4 text-right">Action</th></tr>
                      </thead>
                      <tbody>
                        {suppliers.map(s => {
                          const linkedProductCount = products.filter((product) => (product.suppliers || []).some((supplier) => (supplier?._id || supplier) === s._id)).length;
                          return (
                            <tr key={s._id} className="border-b border-white/5 hover:bg-white/5">
                              <td className="p-4 font-bold">{s.name}</td>
                              <td className="p-4 text-gray-400">{s.contactPerson || 'No contact person'}</td>
                              <td className="p-4">{s.email}</td>
                              <td className="p-4 text-gray-500 text-[13px]">{linkedProductCount} linked item{linkedProductCount === 1 ? '' : 's'}</td>
                              <td className="p-4">
                                <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${s.accountUser ? 'bg-[#78DC8C]/12 text-[#78DC8C]' : 'bg-white/8 text-gray-400'}`}>
                                  {s.accountUser ? 'Account Ready' : 'No Account'}
                                </span>
                              </td>
                              <td className="p-4 text-right">
                                {user.role === 'SuperAdmin' && (
                                  <div className="flex justify-end gap-3">
                                    <button onClick={() => startEditingSupplier(s)} className="text-[#F2C4CE] hover:text-white font-bold uppercase underline text-[12px] transition-colors">Edit</button>
                                    <button onClick={() => handleDeleteSupplier(s._id)} className="text-[#F58F7C] hover:text-red-400 font-bold uppercase underline text-[12px] transition-colors">Remove</button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {supplierSubTab === 'bindings' && (
                  <div className="bg-[#36353A]/40 border border-[#5A595E] rounded-xl overflow-hidden shadow-2xl">
                    <div className="p-4 bg-[#232226] border-b border-[#5A595E]">
                      <div className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#F5A28F]">Supplier Binding</div>
                      <div className="mt-2">
                        <select value={selectedSupplyNetworkProduct?._id || ''} onChange={(e) => setSelectedSupplyNetworkProductId(e.target.value)} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-base text-white">
                          {products.map((product) => <option key={product._id} value={product._id}>{product.name}</option>)}
                        </select>
                      </div>
                    </div>
                    {selectedSupplyNetworkProduct ? (
                      <div className="p-5 space-y-5">
                        <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
                          <div className="text-[12px] uppercase tracking-[0.12em] text-gray-500">Selected Item</div>
                          <div className="mt-2 text-lg font-bold text-white">{selectedSupplyNetworkProduct.name}</div>
                          <div className="mt-1 text-[13px] text-gray-400">SKU: {selectedSupplyNetworkProduct.sku}</div>
                          <div className="mt-3 text-[13px] text-gray-400">Linked suppliers: <span className="text-gray-200">{formatSupplierNames(selectedSupplyNetworkProduct.suppliers)}</span></div>
                          <div className="mt-2 text-[13px] text-gray-400">Selling price: <span className="text-white">{formatCurrency(selectedSupplyNetworkProduct.price)}</span></div>
                          <div className="mt-1 text-[13px] text-gray-400">Lowest supplier cost: <span className="text-[#78DC8C]">{selectedSupplyNetworkCheapestQuote ? `${selectedSupplyNetworkCheapestQuote.supplier?.name || 'Supplier'} - ${formatCurrency(selectedSupplyNetworkCheapestQuote.cost)}` : 'Not set'}</span></div>
                        </div>

                        <div className="space-y-3">
                          {suppliers.map((supplier) => {
                            const supplierId = supplier._id;
                            const isLinked = linkedSupplierIds.includes(supplierId);
                            const isUpdating = productSupplierUpdateId === `${selectedSupplyNetworkProduct._id}:${supplierId}`;
                            const isSavingCost = productSupplierCostUpdateId === `${selectedSupplyNetworkProduct._id}:${supplierId}`;
                            const supplierCostEntry = selectedSupplyNetworkProductPricing.find((entry) => entry.supplierId === supplierId);
                            const draftSupplierCost = Object.prototype.hasOwnProperty.call(productSupplierCostDrafts, supplierId)
                              ? productSupplierCostDrafts[supplierId]
                              : (supplierCostEntry ? String(supplierCostEntry.cost) : '');
                            const costMargin = supplierCostEntry ? selectedSupplyNetworkProduct.price - supplierCostEntry.cost : null;
                            const isCheapestSupplier = selectedSupplyNetworkCheapestQuote?.supplierId === supplierId && supplierCostEntry;
                            return (
                              <div
                                key={supplierId}
                                className={`w-full rounded-xl border p-4 text-left transition ${isLinked ? 'border-[#F2C4CE]/35 bg-[#F2C4CE]/10' : 'border-[#5A595E] bg-[#2C2B30] hover:border-[#F2C4CE]/20 hover:bg-white/5'} ${isUpdating ? 'cursor-wait opacity-70' : ''}`}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <div className="font-bold text-white">{supplier.name}</div>
                                    {supplierCostEntry && (
                                      <div className="mt-1 text-[12px] text-gray-400">
                                        Current cost: <span className="text-white">{formatCurrency(supplierCostEntry.cost)}</span>
                                        {costMargin !== null && <span className="text-[#78DC8C]"> | Margin {formatCurrency(costMargin)}</span>}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {isCheapestSupplier && (
                                      <span className="rounded-full bg-[#78DC8C]/12 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#78DC8C]">
                                        Cheapest
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => toggleProductSupplierBinding(selectedSupplyNetworkProduct._id, supplierId)}
                                      disabled={isUpdating}
                                      className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] transition ${isLinked ? 'bg-[#F2C4CE]/18 text-[#F2C4CE] hover:bg-[#F2C4CE]/25' : 'bg-white/8 text-gray-300 hover:bg-white/12 hover:text-white'}`}
                                    >
                                      {isUpdating ? 'Saving' : isLinked ? 'Linked' : 'Link'}
                                    </button>
                                  </div>
                                </div>

                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="p-8 text-center text-[13px] uppercase tracking-[0.12em] text-gray-500">No products available yet.</div>
                    )}
                  </div>
                )}

              {supplierSubTab === 'warehouses' && (
                <div className="bg-[#36353A]/40 border border-[#5A595E] rounded-xl overflow-hidden shadow-2xl">
                  <div className="p-4 bg-[#232226] border-b border-[#5A595E] flex items-center justify-between">
                    <span className="text-[13px] font-bold uppercase text-[#F58F7C] tracking-[0.12em]">Warehouse Directory</span>
                    {user.role === 'SuperAdmin' && <button onClick={() => { resetWarehouseForm(); setShowWarehouseModal(true); }} className="text-[12px] border border-[#F58F7C] text-[#F58F7C] px-3 py-1 rounded font-bold uppercase hover:bg-[#F58F7C]/10 transition">Add Warehouse</button>}
                  </div>
                  <table className="w-full text-left text-[14px]">
                    <thead className="bg-black/20 text-gray-500 uppercase">
                      <tr><th className="p-4">Warehouse</th><th className="p-4">Address</th><th className="p-4">Assigned Manager</th><th className="p-4 text-right">Action</th></tr>
                    </thead>
                    <tbody>
                      {warehouses.map(warehouse => (
                        <tr key={warehouse._id} className="border-b border-white/5 hover:bg-white/5">
                          <td className="p-4 font-bold">{warehouse.name}</td>
                          <td className="p-4 text-gray-400">{warehouse.address || 'No address provided'}</td>
                          <td className="p-4 text-gray-300">{warehouse.manager?.name || 'Unassigned'}</td>
                          <td className="p-4 text-right">
                            {user.role === 'SuperAdmin' && (
                              <div className="flex justify-end gap-3">
                                <button onClick={() => startEditingWarehouse(warehouse)} className="text-[#F2C4CE] hover:text-white font-bold uppercase underline text-[12px] transition-colors">Edit</button>
                                <button onClick={() => handleDeleteWarehouse(warehouse._id)} className="text-[#F58F7C] hover:text-red-400 font-bold uppercase underline text-[12px] transition-colors">Remove</button>
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
              <div className="bg-[#36353A]/40 border border-[#5A595E] rounded-xl overflow-hidden shadow-2xl">
                <div className="p-4 bg-[#232226] border-b border-[#5A595E] flex items-center justify-between gap-4">
                  <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#F2C4CE]">Supply Chain Intelligence</h2>
                  <button onClick={exportToCSV} className="bg-[#F2C4CE] text-[#2C2B30] px-4 py-2 rounded font-bold text-[13px] flex items-center gap-2 hover:brightness-110">
                    <Download size={14}/> EXPORT ANALYTICS
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
                <div className="p-6 bg-[#36353A]/40 border border-[#5A595E] rounded-2xl min-w-0">
                  <p className="text-[13px] text-gray-500 uppercase font-bold mb-2">Total Inventory Value</p>
                  <p className="text-3xl font-bold text-[#78DC8C]">₱{totalValue.toLocaleString()}</p>
                </div>
                <div className="p-6 bg-[#36353A]/40 border border-[#F2C4CE]/20 rounded-2xl min-w-0">
                  <p className="text-[13px] text-gray-500 uppercase font-bold mb-2">Critical Stock Alerts</p>
                  <p className="text-3xl font-bold text-[#F2C4CE]">{lowStockCount}</p>
                </div>
              
                {warehouseNames.map((warehouseName) => (
                  <div key={warehouseName} className="p-6 bg-[#36353A]/40 border border-[#5A595E] rounded-2xl min-w-0">
                    <p className="text-[13px] text-gray-500 uppercase font-bold mb-2">{warehouseName} Total Stock</p>
                    <p className="text-3xl font-bold text-white">{(warehouseTotals[warehouseName] || 0).toLocaleString()} units</p>
                  </div>
                ))}
              </div>
              {user.role === 'Manager' && assignedWarehouseLabel && (
                <div className="rounded-2xl border border-[#F2C4CE]/20 bg-[#36353A]/40 px-6 py-4 text-[13px] uppercase tracking-[0.12em] text-gray-400">
                  Scoped to warehouse: <span className="font-bold text-[#F2C4CE]">{assignedWarehouseLabel}</span>
                </div>
              )}

              <div className="bg-[#36353A]/40 border border-[#5A595E] rounded-2xl overflow-hidden shadow-2xl">
                <div className="p-4 bg-[#232226] border-b border-[#5A595E] text-[13px] font-bold uppercase tracking-[0.12em] text-[#F2C4CE]">Financial Breakdown</div>
                <table className="w-full text-left text-[14px]">
                  <thead className="bg-black/20 text-gray-500 uppercase">
                    <tr><th className="p-4">Product Name</th><th className="p-4">Unit Price</th><th className="p-4">Total Units</th><th className="p-4 text-right">Sub-Total Value</th></tr>
                  </thead>
                  <tbody>
                    {products.map(p => (
                      <tr key={p._id} className="border-b border-white/5 hover:bg-white/5 transition">
                        <td className="p-4 font-bold">{p.name}</td>
                        <td className="p-4">{formatCurrency(p.price)}</td>
                        <td className="p-4">{p.totalStock} {p.unitOfMeasure || 'unit'}</td>
                        <td className="p-4 text-right font-bold text-[#78DC8C]">{formatCurrency(p.price * p.totalStock)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {['Manager', 'SuperAdmin'].includes(user.role) && (
                <div className="bg-[#36353A]/40 border border-[#5A595E] rounded-2xl overflow-hidden">
                  <div className="p-4 bg-[#232226] border-b border-[#5A595E] flex items-center gap-2 text-[13px] font-bold text-[#F2C4CE] uppercase">
                    <ShieldCheck size={16}/> Node Activity Logs
                  </div>
                  <div className="p-4 space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                    {orders.slice(0, 8).map(o => (
                      <div key={o._id} className="text-[13px] flex items-center gap-3 border-l-2 border-[#F2C4CE] pl-3 py-1 bg-white/5">
                        <span className="text-gray-500">[{new Date(o.createdAt).toLocaleTimeString()}]</span>
                        <span className="text-white">Order {o._id.slice(-5)} updated to <b className="text-[#78DC8C]">{o.status}</b></span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'expenses' && canViewExpenses && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-[#5A595E] bg-[#36353A]/40 px-5 py-4 shadow-2xl">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#F2C4CE]">Expense Categories</div>
                    <p className="mt-2 text-[14px] leading-7 text-gray-400">
                      {expenseSubTab === 'payables'
                        ? (expenseViewMode === 'history'
                          ? 'Review settled supplier disbursements and completed payable records.'
                          : 'Review active supplier payable entries and process disbursements when due.')
                        : (expenseViewMode === 'history'
                          ? 'Review settled customer collections and completed receivable records.'
                          : 'Review active customer receivables and record collections when payments arrive.')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button onClick={() => setExpenseViewMode('current')} className={`rounded-lg px-5 py-3 text-[13px] font-bold uppercase tracking-[0.12em] transition ${expenseViewMode === 'current' ? 'border border-[#F2C4CE]/30 bg-[#F2C4CE]/12 text-[#F2C4CE]' : 'border border-[#5A595E] text-gray-400 hover:bg-white/5 hover:text-white'}`}>
                      {expenseSubTab === 'payables' ? 'Accounts Payable' : 'Accounts Receivable'}
                    </button>
                    <button onClick={() => setExpenseViewMode('history')} className={`rounded-lg px-5 py-3 text-[13px] font-bold uppercase tracking-[0.12em] transition ${expenseViewMode === 'history' ? 'border border-[#F2C4CE]/30 bg-[#F2C4CE]/12 text-[#F2C4CE]' : 'border border-[#5A595E] text-gray-400 hover:bg-white/5 hover:text-white'}`}>
                      {expenseSubTab === 'payables' ? 'Disbursement History' : 'Collections History'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-[#5A595E] bg-[#36353A]/40 p-6 shadow-2xl">
                  <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-gray-500">
                    {expenseViewMode === 'history'
                      ? (expenseSubTab === 'payables' ? 'Disbursements' : 'Collections')
                      : (expenseSubTab === 'payables' ? 'Accounts Payable' : 'Accounts Receivable')}
                  </p>
                  <p className="mt-3 text-3xl font-bold text-[#F7C0B4]">
                    {formatCurrency(
                      expenseViewMode === 'history'
                        ? (expenseSubTab === 'payables' ? disbursementTotal : collectionsTotal)
                        : (expenseSubTab === 'payables' ? accountsPayableTotal : accountsReceivableTotal)
                    )}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#5A595E] bg-[#36353A]/40 p-6 shadow-2xl">
                  <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-gray-500">
                    {expenseViewMode === 'history' ? 'Recorded Total' : (expenseSubTab === 'payables' ? 'Disbursements' : 'Collections')}
                  </p>
                  <p className="mt-3 text-3xl font-bold text-[#78DC8C]">
                    {formatCurrency(expenseSubTab === 'payables' ? disbursementTotal : collectionsTotal)}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#5A595E] bg-[#36353A]/40 p-6 shadow-2xl">
                  <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-gray-500">
                    {expenseViewMode === 'history' ? 'History Entries' : 'Open Entries'}
                  </p>
                  <p className="mt-3 text-3xl font-bold text-white">
                    {expenseViewMode === 'history'
                      ? historicalExpenseLedgerOrders.length
                      : currentExpenseLedgerOrders.length}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#5A595E] bg-[#36353A]/40 p-6 shadow-2xl">
                  <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-gray-500">
                    {expenseViewMode === 'history' ? 'Visible History' : 'Visible Ledger'}
                  </p>
                  <p className="mt-3 text-3xl font-bold text-white">{visibleExpenseLedgerOrders.length}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-[#5A595E] bg-[#36353A]/40 shadow-2xl overflow-hidden">
                <div className="border-b border-[#5A595E] bg-[#232226] px-5 py-4">
                  <div className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#F2C4CE]">
                    {expenseViewMode === 'history'
                      ? (expenseSubTab === 'payables' ? 'Accounts Payable History' : 'Accounts Receivable History')
                      : (expenseSubTab === 'payables' ? 'Accounts Payable Ledger' : 'Accounts Receivable Ledger')}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1180px] text-left text-[15px]">
                    <thead className="bg-black/20 text-gray-500 uppercase border-b border-[#5A595E]">
                      <tr>
                        <th className="p-4">Date</th>
                        <th className="p-4">Party</th>
                        <th className="p-4">Product</th>
                        <th className="p-4">Ledger Type</th>
                        <th className="p-4">Warehouse</th>
                        <th className="p-4">Quantity</th>
                        <th className="p-4">Unit Price</th>
                        <th className="p-4 text-right">Amount</th>
                        <th className="p-4">Operational Status</th>
                        <th className="p-4">Accounting Status</th>
                        <th className="p-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleExpenseLedgerOrders.map((order) => (
                        <tr key={order._id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="p-4 text-gray-400">{new Date(order.createdAt).toLocaleString()}</td>
                          <td className="p-4">
                            <div className="font-bold text-white">{order.orderType === 'Inbound' ? (order.supplier?.name || 'No supplier') : 'Customer Sale'}</div>
                          </td>
                          <td className="p-4 text-gray-300">{order.product?.name || 'No product'}</td>
                          <td className="p-4 font-bold text-[#F2C4CE]">{order.accountingTerm}</td>
                          <td className="p-4 text-[#F2C4CE] font-bold">{order.warehouse}</td>
                          <td className="p-4 text-white">{order.quantity} {order.product?.unitOfMeasure || 'unit'}</td>
                          <td className="p-4 text-white">{formatCurrency(order.orderType === 'Inbound' ? order.supplierUnitPrice : order.customerUnitPrice)}</td>
                          <td className="p-4 text-right font-bold text-[#F7C0B4]">{formatCurrency(order.orderType === 'Inbound' ? order.expenseAmount : order.receivableAmount)}</td>
                          <td className="p-4">
                            <span className={`inline-flex rounded-full px-3 py-1 text-[12px] font-bold uppercase tracking-[0.12em] ${order.status === 'Delivered' ? 'bg-[#78DC8C]/15 text-[#9AE8AA]' : 'bg-[#F2C4CE]/15 text-[#F2C4CE]'}`}>
                              {order.status === 'Delivered' ? 'Completed' : order.status}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="flex flex-col gap-2">
                              <span className={`inline-flex w-fit rounded-full px-3 py-1 text-[12px] font-bold uppercase tracking-[0.12em] ${
                                getOrderAccountingStatusTone(order) === 'success'
                                  ? 'bg-[#78DC8C]/15 text-[#9AE8AA]'
                                  : getOrderAccountingStatusTone(order) === 'danger'
                                    ? 'bg-red-400/15 text-red-300'
                                    : getOrderAccountingStatusTone(order) === 'warning'
                                      ? 'bg-[#F5A28F]/15 text-[#F7C0B4]'
                                      : 'bg-[#F2C4CE]/15 text-[#F2C4CE]'
                              }`}>
                                {order.accountingTerm}
                              </span>
                              {order.accountingFailureReason && (
                                <span className="text-[11px] leading-5 text-red-300">{order.accountingFailureReason}</span>
                              )}
                            </div>
                          </td>
                          <td className="p-4 text-right">
                            {order.accountingSettlementStatus !== 'Settled' ? (
                              <button
                                disabled={orderNeedsSupplierQuoteForDisbursement(order)}
                                onClick={() => {
                                  if (order.accountingAction === 'REFRESH_DISBURSEMENT') {
                                    handleAccountingAction(order._id, order.accountingAction);
                                  } else {
                                    openAccountingActionModal(order, order.accountingAction);
                                  }
                                }}
                                className={`rounded-full border px-3 py-1 text-[12px] uppercase font-bold transition ${
                                  orderNeedsSupplierQuoteForDisbursement(order)
                                    ? 'cursor-not-allowed border-[#5A595E] bg-white/5 text-gray-500'
                                    : 'border-[#F2C4CE]/40 bg-[#F2C4CE]/10 text-[#F2C4CE] hover:bg-[#F2C4CE]/20 hover:text-white'
                                }`}
                              >
                                {orderNeedsSupplierQuoteForDisbursement(order)
                                  ? 'Missing Quote'
                                  : order.accountingAction === 'DISBURSE'
                                  ? 'Disbursement'
                                  : order.accountingAction === 'RETRY_DISBURSEMENT'
                                    ? 'Retry Disbursement'
                                    : order.accountingAction === 'RELEASE_ESCROW'
                                      ? 'Release Payment'
                                    : order.accountingAction === 'REFRESH_DISBURSEMENT'
                                      ? 'Disbursement'
                                      : 'Collect'}
                              </button>
                            ) : (
                              <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-gray-500">
                                {order.accountingSettledByName ? `By ${order.accountingSettledByName}` : 'Recorded'}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {visibleExpenseLedgerOrders.length === 0 && (
                        <tr>
                          <td colSpan="11" className="p-6 text-center text-[14px] text-gray-500">No active accounting entries recorded yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {expenseSubTab === 'payables' && expenseViewMode === 'history' && (
                <div className="rounded-2xl border border-[#5A595E] bg-[#36353A]/40 shadow-2xl overflow-hidden">
                  <div className="border-b border-[#5A595E] bg-[#232226] px-5 py-4">
                    <div className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#F2C4CE]">Disbursement History</div>
                  </div>
                  <div className="max-h-[360px] overflow-y-auto custom-scrollbar">
                    {disbursementHistoryEntries.length > 0 ? (
                      <div className="divide-y divide-white/5">
                        {disbursementHistoryEntries.map((entry) => (
                          <div key={entry.key} className="grid gap-3 px-5 py-4 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
                            <div>
                              <div className="text-sm font-bold text-white">{entry.order?.supplier?.name || 'No supplier'}</div>
                              <div className="mt-1 text-[12px] text-gray-500">{entry.order?.product?.name || 'No product'}</div>
                              <div className="mt-1 text-[12px] text-gray-500">{new Date(entry.createdAt).toLocaleString()}</div>
                            </div>
                            <div>
                              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500">Status</div>
                              <div className="mt-1 text-sm font-bold text-[#F7C0B4]">{entry.status || 'Unknown'}</div>
                              {entry.failureReason && <div className="mt-1 text-[12px] leading-5 text-red-300">{entry.failureReason}</div>}
                            </div>
                            <div>
                              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500">Method</div>
                              <div className="mt-1 text-sm text-white">{[entry.paymentMethodName, entry.paymentMethodAccountName, entry.paymentMethodAccountNumberMasked].filter(Boolean).join(' • ') || 'N/A'}</div>
                              {entry.channelName && <div className="mt-1 text-[12px] text-gray-500">{entry.channelName}</div>}
                            </div>
                            <div>
                              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500">Reference</div>
                              <div className="mt-1 text-sm text-white">{entry.referenceId || entry.payoutId || 'N/A'}</div>
                              <div className="mt-1 text-[12px] text-gray-500">{entry.processedByName || 'System'}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="px-5 py-6 text-[14px] text-gray-500">No disbursement attempts recorded yet.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'users' && ['Manager', 'SuperAdmin'].includes(user.role) && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1 bg-[#36353A]/40 border border-[#5A595E] p-8 rounded-2xl shadow-xl h-fit">
                <h3 className="text-base font-bold text-[#F2C4CE] uppercase mb-6 tracking-[0.12em]">{editingUserId ? 'Edit Personnel' : 'Register Personnel'}</h3>
                <form onSubmit={handleRegisterStaff} className="space-y-4" autoComplete="off">
                  <input type="text" name="username" autoComplete="username" tabIndex={-1} className="hidden" />
                  <input type="password" name="password" autoComplete="current-password" tabIndex={-1} className="hidden" />
                  <div><label className="text-[13px] text-gray-500 uppercase font-bold">Full Name</label><input type="text" name="personnel_name" autoComplete="section-personnel off" value={newStaff.name} onChange={(e) => setNewStaff({...newStaff, name: e.target.value})} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-base text-white" required /></div>
                  <div><label className="text-[13px] text-gray-500 uppercase font-bold">Email</label><input type="email" name="personnel_email" autoComplete="section-personnel new-email" value={newStaff.email} onChange={(e) => setNewStaff({...newStaff, email: e.target.value})} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-base text-white" required /></div>
                  <div><label className="text-[13px] text-gray-500 uppercase font-bold">Password</label><input type="password" name="personnel_password" autoComplete="new-password" value={newStaff.password} onChange={(e) => setNewStaff({...newStaff, password: e.target.value})} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-base text-white" required={!editingUserId} placeholder={editingUserId ? 'Enter new password' : ''} /></div>
                  <div>
                    <label className="text-[13px] text-gray-500 uppercase font-bold">Role</label>
                    {!editingUserId && ['SuperAdmin', 'Manager'].includes(user.role) ? (
                      <select value={newStaff.role} onChange={(e) => setNewStaff({...newStaff, role: e.target.value})} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-base text-white">
                        <option value="Staff">Staff</option>
                        <option value="Accountant">Accountant</option>
                        {user.role === 'SuperAdmin' && <option value="Manager">Manager</option>}
                      </select>
                    ) : (
                      <input type="text" value={newStaff.role || 'Staff'} readOnly className="w-full bg-[#232226] border border-[#5A595E] p-3 rounded text-base text-gray-400" />
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button type="submit" className="flex-1 bg-[#F2C4CE] text-[#2C2B30] py-4 rounded font-bold uppercase text-[13px] tracking-[0.12em] shadow-lg hover:brightness-110 transition-all">{editingUserId ? 'Save Changes' : 'Authorize Access'}</button>
                    {editingUserId && <button type="button" onClick={resetPersonnelForm} className="px-5 border border-[#5A595E] text-gray-400 rounded font-bold uppercase text-[13px] tracking-[0.12em] hover:bg-white/5 transition-all">Cancel</button>}
                  </div>
                </form>
              </div>
              <div className="lg:col-span-2 bg-[#36353A]/40 border border-[#5A595E] rounded-2xl overflow-hidden shadow-2xl">
                <div className="p-4 bg-[#232226] border-b border-[#5A595E] text-[13px] font-bold uppercase tracking-[0.12em] text-[#F2C4CE]">Authorized Personnel</div>
                <table className="w-full text-left text-[14px]">
                  <thead className="bg-black/20 text-gray-500 uppercase border-b border-[#5A595E]">
                    <tr><th className="p-4">Name</th><th className="p-4">Email</th><th className="p-4">Role</th><th className="p-4 text-right">Action</th></tr>
                  </thead>
                  <tbody>
                    {sortedUsers.map(u => (
                      <tr key={u._id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="p-4 font-bold">{u.name}</td>
                        <td className="p-4 text-gray-400">{u.email}</td>
                        <td className="p-4"><span className={`px-2 py-0.5 rounded-full text-[12px] font-black ${u.role === 'SuperAdmin' ? 'bg-[#F58F7C]/20 text-[#F58F7C]' : u.role === 'Manager' ? 'bg-[#F2C4CE]/20 text-[#F2C4CE]' : u.role === 'Accountant' ? 'bg-[#93C5FD]/18 text-[#BFDBFE]' : u.role === 'Supplier' ? 'bg-[#78DC8C]/15 text-[#9AE8AA]' : 'bg-white/10 text-gray-400'}`}>{u.role.toUpperCase()}</span></td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-3">
                            {canEditUser(u) && <button onClick={() => startEditingUser(u)} className="text-[#F2C4CE] hover:text-white font-bold uppercase underline text-[12px] transition-colors">Edit</button>}
                            {user.role === 'SuperAdmin' && u._id !== user._id && !['SuperAdmin', 'Supplier'].includes(u.role) && <button onClick={() => handleDeactivateUser(u._id)} className="text-[#F58F7C] hover:text-red-400 font-bold uppercase underline text-[12px] transition-colors">Revoke</button>}
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

      {showPurchaseOrderModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 p-6 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-[28px] border border-[#5A595E] bg-[#36353A] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.4)] md:p-8">
            <div className="flex flex-col gap-3 border-b border-white/10 pb-5 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-[12px] uppercase tracking-[0.18em] text-[#F2C4CE]">Purchase Order Signing</div>
                <h3 className="mt-2 text-2xl font-bold text-white">{purchaseOrderRecord?.poNumber || 'Loading...'}</h3>
                <p className="mt-2 text-[14px] text-gray-400">
                  {purchaseOrderRecord?.order?.product?.name || 'Supplier restock'} for {purchaseOrderRecord?.order?.warehouse || WAREHOUSE_A_NAME}
                </p>
              </div>
              <button onClick={closePurchaseOrderModal} className="rounded-full border border-[#5A595E] px-4 py-2 text-[12px] font-bold uppercase tracking-[0.14em] text-gray-300 transition hover:bg-white/5">
                Close
              </button>
            </div>

            {purchaseOrderLoading ? (
              <div className="py-16 text-center text-[14px] text-gray-400">Loading purchase order...</div>
            ) : purchaseOrderRecord && (
              <div className="mt-6 grid gap-6 md:grid-cols-[1.08fr,0.92fr]">
                <div className="flex min-h-full flex-col rounded-2xl border border-[#5A595E] bg-black/10 p-5">
                  <div className="text-[12px] uppercase tracking-[0.16em] text-gray-500">Current Status</div>
                  <div className="mt-3 text-lg font-bold leading-snug text-[#F7C0B4]">{purchaseOrderRecord.status}</div>

                  <div className="mt-5 grid gap-3 text-[14px] md:grid-cols-2">
                    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                      <span className="text-[12px] uppercase tracking-[0.12em] text-gray-500">Supplier</span>
                      <div className="mt-2 font-bold leading-snug text-white">{purchaseOrderRecord.order?.supplier?.name || 'N/A'}</div>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                      <span className="text-[12px] uppercase tracking-[0.12em] text-gray-500">Delivery Date</span>
                      <div className="mt-2 font-bold text-white">{purchaseOrderRecord.expectedDeliveryDate ? new Date(purchaseOrderRecord.expectedDeliveryDate).toLocaleDateString() : 'Pending'}</div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
                      <div className="text-[12px] uppercase tracking-[0.12em] text-gray-500">Warehouse Sign</div>
                      <div className="mt-2 font-bold text-white">{purchaseOrderRecord.warehouseManagerSignature?.signedAt ? purchaseOrderRecord.warehouseManagerSignature.signerName : 'Waiting'}</div>
                      <div className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${purchaseOrderRecord.warehouseManagerSignature?.signedAt ? 'bg-green-400/10 text-green-200' : 'bg-[#F2C4CE]/10 text-[#F7C0B4]'}`}>
                        {purchaseOrderRecord.warehouseManagerSignature?.signedAt ? 'Signed' : 'Pending'}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
                      <div className="text-[12px] uppercase tracking-[0.12em] text-gray-500">CEO Sign</div>
                      <div className="mt-2 font-bold text-white">{purchaseOrderRecord.ownerSignature?.signedAt ? purchaseOrderRecord.ownerSignature.signerName : 'Waiting'}</div>
                      <div className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${purchaseOrderRecord.ownerSignature?.signedAt ? 'bg-green-400/10 text-green-200' : 'bg-[#F2C4CE]/10 text-[#F7C0B4]'}`}>
                        {purchaseOrderRecord.ownerSignature?.signedAt ? 'Signed' : 'Pending'}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 rounded-xl border border-white/8 bg-white/[0.03] p-4">
                    <div className="text-[12px] uppercase tracking-[0.12em] text-gray-500">Next Step</div>
                    <div className="mt-2 text-[14px] leading-7 text-gray-300">
                      {purchaseOrderRecord.status === 'Awaiting Warehouse Manager Signature' && 'Warehouse A manager must sign this purchase order.'}
                      {purchaseOrderRecord.status === 'Awaiting CEO Signature' && 'The company owner must review and sign before supplier email is sent.'}
                      {purchaseOrderRecord.status === 'Awaiting Supplier Signature' && 'The supplier has been invited to review and complete the final signature.'}
                      {purchaseOrderRecord.status === 'Supplier Signed' && 'All required signatures are complete. This restock can now proceed to delivery.'}
                    </div>
                  </div>

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    {hasCompanySignedCopy && (
                      <a
                        href={getDocumentUrl(purchaseOrderRecord.companyDocumentUrl)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center rounded-xl border border-[#F2C4CE]/25 bg-[#F2C4CE]/10 px-4 py-3 text-[13px] font-bold uppercase tracking-[0.12em] text-[#F7C0B4] transition hover:bg-[#F2C4CE]/20 hover:text-white"
                      >
                        {purchaseOrderRecord.ownerSignature?.signedAt ? 'Download Company-Signed Copy' : 'Download Current Purchase Order'}
                      </a>
                    )}

                    {hasFinalSignedCopy && (
                      <a
                        href={getDocumentUrl(purchaseOrderRecord.finalDocumentUrl)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center rounded-xl border border-green-400/30 bg-green-400/10 px-4 py-3 text-[13px] font-bold uppercase tracking-[0.12em] text-green-200 transition hover:bg-green-400/20"
                      >
                        Open Final Signed Copy
                      </a>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#5A595E] bg-[#2C2B30]/70 p-5">
                  <div className="text-[12px] uppercase tracking-[0.16em] text-[#F2C4CE]">
                    {user.role === 'SuperAdmin' ? 'CEO Signature' : 'Warehouse A Manager Signature'}
                  </div>
                  {canCurrentUserSignPurchaseOrderRecord(purchaseOrderRecord) ? (
                    <>
                      <p className="mt-3 text-[14px] text-gray-400">
                        Draw your signature below. Once both company signatures are complete, the purchase order is emailed to the supplier for confirmation.
                      </p>
                      <div className="mt-5">
                        <SignaturePadField busy={purchaseOrderSubmitting} buttonLabel="Save Signature" onSave={handlePurchaseOrderSignature} />
                      </div>
                    </>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/10 px-4 py-4 text-[14px] text-gray-300">
                      Signature complete for your side, or waiting for the next signer.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showTransferOrderModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 p-6 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-[28px] border border-[#5A595E] bg-[#36353A] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.4)] md:p-8">
            <div className="flex flex-col gap-3 border-b border-white/10 pb-5 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-[12px] uppercase tracking-[0.18em] text-[#F2C4CE]">Stock Transfer Signing</div>
                <h3 className="mt-2 text-2xl font-bold text-white">{transferOrderRecord?.transferNumber || 'Loading...'}</h3>
                <p className="mt-2 text-[14px] text-gray-400">
                  {transferOrderRecord?.order?.product?.name || 'Stock transfer'} from {transferOrderRecord?.order?.sourceWarehouse || 'Source Warehouse'} to {transferOrderRecord?.order?.warehouse || 'Requesting Warehouse'}
                </p>
              </div>
              <button onClick={closeTransferOrderModal} className="rounded-full border border-[#5A595E] px-4 py-2 text-[12px] font-bold uppercase tracking-[0.14em] text-gray-300 transition hover:bg-white/5">
                Close
              </button>
            </div>

            {transferOrderLoading ? (
              <div className="py-16 text-center text-[14px] text-gray-400">Loading stock transfer document...</div>
            ) : transferOrderRecord && (
              <div className="mt-6 grid gap-6 md:grid-cols-[1.08fr,0.92fr]">
                <div className="flex min-h-full flex-col rounded-2xl border border-[#5A595E] bg-black/10 p-5">
                  <div className="text-[12px] uppercase tracking-[0.16em] text-gray-500">Current Status</div>
                  <div className="mt-3 text-lg font-bold leading-snug text-[#F7C0B4]">{transferOrderRecord.status}</div>

                  <div className="mt-5 grid gap-3 text-[14px] md:grid-cols-2">
                    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                      <span className="text-[12px] uppercase tracking-[0.12em] text-gray-500">Requesting Warehouse</span>
                      <div className="mt-2 font-bold leading-snug text-white">{transferOrderRecord.order?.warehouse || 'N/A'}</div>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                      <span className="text-[12px] uppercase tracking-[0.12em] text-gray-500">Receiving From</span>
                      <div className="mt-2 font-bold leading-snug text-white">{transferOrderRecord.order?.sourceWarehouse || 'N/A'}</div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                      <span className="text-[12px] uppercase tracking-[0.12em] text-gray-500">Requesting Manager</span>
                      <div className="mt-2 font-bold text-white">
                        {transferOrderRecord.requestingWarehouseSignature?.signerName || 'Waiting'}
                      </div>
                      <div className={`mt-2 inline-flex rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${transferOrderRecord.requestingWarehouseSignature?.signedAt ? 'border border-green-400/30 bg-green-400/10 text-green-200' : 'border border-[#F2C4CE]/20 bg-[#F2C4CE]/10 text-[#F7C0B4]'}`}>
                        {transferOrderRecord.requestingWarehouseSignature?.signedAt ? 'Signed' : 'Pending'}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                      <span className="text-[12px] uppercase tracking-[0.12em] text-gray-500">Receiving Manager</span>
                      <div className="mt-2 font-bold text-white">
                        {transferOrderRecord.requestedWarehouseSignature?.signerName || 'Waiting'}
                      </div>
                      <div className={`mt-2 inline-flex rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${transferOrderRecord.requestedWarehouseSignature?.signedAt ? 'border border-green-400/30 bg-green-400/10 text-green-200' : 'border border-[#F2C4CE]/20 bg-[#F2C4CE]/10 text-[#F7C0B4]'}`}>
                        {transferOrderRecord.requestedWarehouseSignature?.signedAt ? 'Signed' : 'Pending'}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="text-[12px] uppercase tracking-[0.14em] text-gray-500">Next Step</div>
                    <div className="mt-3 text-[15px] leading-8 text-gray-200">
                      {transferOrderRecord.status === 'Awaiting Requesting Warehouse Manager Signature' && 'The requesting warehouse manager must sign this transfer document first.'}
                      {transferOrderRecord.status === 'Awaiting Requested Warehouse Manager Signature' && 'The requested warehouse manager must review and complete the second signature.'}
                      {transferOrderRecord.status === 'Transfer Signed' && 'Both warehouse managers have signed. This stock transfer can now proceed to receiving.'}
                    </div>
                  </div>

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    {hasTransferDraftCopy && (
                      <a
                        href={getDocumentUrl(transferOrderRecord.documentUrl)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center rounded-xl border border-[#F2C4CE]/25 bg-[#F2C4CE]/10 px-4 py-3 text-[13px] font-bold uppercase tracking-[0.12em] text-[#F7C0B4] transition hover:bg-[#F2C4CE]/20 hover:text-white"
                      >
                        Download Current Transfer Document
                      </a>
                    )}

                    {hasTransferFinalCopy && (
                      <a
                        href={getDocumentUrl(transferOrderRecord.finalDocumentUrl)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center rounded-xl border border-green-400/30 bg-green-400/10 px-4 py-3 text-[13px] font-bold uppercase tracking-[0.12em] text-green-200 transition hover:bg-green-400/20"
                      >
                        Open Final Signed Copy
                      </a>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#5A595E] bg-black/10 p-5">
                  <div className="text-[12px] uppercase tracking-[0.16em] text-[#F2C4CE]">
                    {assignedWarehouseNames.includes(transferOrderRecord.order?.warehouse)
                      ? 'Requesting Warehouse Manager Signature'
                      : 'Requested Warehouse Manager Signature'}
                  </div>
                  {canCurrentUserSignTransferOrderRecord(transferOrderRecord) ? (
                    <>
                      <p className="mt-3 text-[14px] text-gray-400">
                        Draw your signature below. This transfer document requires signatures from both the requesting and requested warehouse managers.
                      </p>
                      <div className="mt-5">
                        <SignaturePadField busy={transferOrderSubmitting} buttonLabel="Save Signature" onSave={handleTransferOrderSignature} />
                      </div>
                    </>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/10 px-4 py-4 text-[14px] text-gray-300">
                      Signature complete for your side, or waiting for the other warehouse manager.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showOrderModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <form onSubmit={handleCreateOrder} className="bg-[#36353A] border border-[#5A595E] p-8 rounded-2xl w-full max-w-md space-y-5 shadow-2xl">
            <h3 className="text-base font-bold text-[#F2C4CE] uppercase tracking-[0.12em] border-b border-white/10 pb-4">Initialize Stock Request</h3>
            <div className="space-y-1"><label className="text-[13px] text-gray-500 uppercase font-bold">Transfer Type</label><select className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-base text-white font-bold" onChange={(e) => handleOrderTypeChange(e.target.value)} value={modalOrderType}>{canSupplierRestock && <option value="Inbound">Restock</option>}{canRequestTransfer && <option value="Transfer">Stock Transfer</option>}<option value="Outbound">Sale (To Customer)</option></select></div>
            <div className="space-y-1"><label className="text-[13px] text-gray-500 uppercase font-bold">Product</label><select className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-base text-white" onChange={(e) => {
              const productId = e.target.value;
              const selectedProduct = products.find((product) => product._id === productId);
              setNewOrder({
                ...newOrder,
                product: productId,
                supplier: showSupplierSelection ? (getCheapestSupplierQuote(selectedProduct)?.supplierId || selectedProduct?.suppliers?.[0]?._id || selectedProduct?.suppliers?.[0] || '') : '',
              });
              }} required value={newOrder.product}><option value="">-- Choose Product --</option>{products.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}</select></div>
              {showSupplierSelection && (
                <div className="space-y-2">
                  <label className="text-[13px] text-gray-500 uppercase font-bold">Supplier</label>
                  <select value={newOrder.supplier} onChange={(e) => setNewOrder({ ...newOrder, supplier: e.target.value })} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-base text-white" required>
                    <option value="">Select linked supplier</option>
                    {selectedOrderProductSuppliers.map((supplier) => {
                      const supplierCostEntry = getSupplierCostEntry(selectedOrderProduct, supplier._id);
                      return (
                        <option key={supplier._id} value={supplier._id}>
                          {supplierCostEntry ? `${supplier.name} - ${formatCurrency(supplierCostEntry.cost)}` : supplier.name}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><label className="text-[13px] text-gray-500 uppercase font-bold">Quantity</label><input type="number" min="0" className="no-number-spinner w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-base text-white outline-none" onChange={(e) => setNewOrder({...newOrder, quantity: Math.max(0, Number(e.target.value) || 0)})} required value={newOrder.quantity || ''} /></div>
              {modalOrderType === 'Transfer' ? (
                <div className="space-y-1">
                  <label className="text-[13px] text-gray-500 uppercase font-bold">Source Warehouse</label>
                  <select
                    className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-base text-white"
                    onChange={(e) => setNewOrder({ ...newOrder, sourceWarehouse: e.target.value })}
                    value={newOrder.sourceWarehouse}
                    required
                  >
                    <option value="">
                      {selectedOrderProduct
                        ? (transferSourceWarehouseOptions.length > 0 ? '-- Choose Source --' : '-- No Source Stock --')
                        : '-- Choose Product --'}
                    </option>
                    {transferSourceWarehouseOptions.map((warehouse) => {
                      const stockEntry = selectedOrderProduct?.warehouses?.find((entry) => entry.name === warehouse.name);
                      const availableStock = stockEntry?.stock || 0;
                      const unitLabel = selectedOrderProduct?.unitOfMeasure || 'unit';
                      return (
                        <option key={warehouse._id} value={warehouse.name}>
                          {`${warehouse.name} - ${availableStock} ${unitLabel}`}
                        </option>
                      );
                    })}
                  </select>
                </div>
              ) : (
                <div className="space-y-1"><label className="text-[13px] text-gray-500 uppercase font-bold">{modalOrderType === 'Outbound' ? 'Selling Warehouse' : 'Target Hub'}</label><select className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-base text-white" onChange={(e) => setNewOrder({ ...newOrder, warehouse: e.target.value })} value={newOrder.warehouse}>{orderWarehouseOptions.map((warehouse) => <option key={warehouse._id} value={warehouse.name}>{warehouse.name}</option>)}</select></div>
              )}
            </div>
            <div className="flex gap-4 pt-4"><button type="submit" className="flex-1 bg-[#F2C4CE] text-[#2C2B30] font-bold py-4 rounded text-base uppercase shadow-lg hover:brightness-110">Authorize</button><button type="button" onClick={() => { resetOrderForm(); setShowOrderModal(false); }} className="flex-1 border border-[#5A595E] text-gray-400 font-bold py-4 rounded text-base uppercase hover:bg-white/5 transition">Cancel</button></div>
          </form>
        </div>
      )}
      {showProductModal && canManageProducts && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
            <form onSubmit={handleCreateProduct} className="bg-[#36353A] border border-[#5A595E] p-8 rounded-2xl w-full max-w-2xl space-y-5 shadow-2xl">
              <input
                ref={productImportInputRef}
                type="file"
                accept=".xlsx"
                onChange={handleBulkProductImport}
                className="hidden"
              />
              <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
                <h3 className="text-base font-bold text-[#F58F7C] uppercase tracking-[0.12em]">{editingProductId ? 'Edit Product' : 'Register Product'}</h3>
                {!editingProductId && (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleDownloadProductImportTemplate}
                      disabled={productTemplateDownloading || productImportSubmitting}
                      className="rounded-lg border border-[#5A595E] px-4 py-2 text-[13px] font-bold uppercase tracking-[0.12em] text-gray-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {productTemplateDownloading ? 'Downloading...' : 'Template'}
                    </button>
                    <button
                      type="button"
                      onClick={() => productImportInputRef.current?.click()}
                      disabled={productImportSubmitting || productTemplateDownloading}
                      className="rounded-lg border border-[#F58F7C]/60 px-4 py-2 text-[13px] font-bold uppercase tracking-[0.12em] text-[#F2C4CE] transition hover:bg-[#F58F7C]/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {productImportSubmitting ? 'Importing...' : 'Import'}
                    </button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1"><label className="text-[13px] text-gray-500 uppercase font-bold">Product Name</label><input type="text" value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-base text-white" required /></div>
                <div className="space-y-1">
                  <label className="text-[13px] text-gray-500 uppercase font-bold">Product Code (SKU)</label>
                  <input
                    ref={productCodeInputRef}
                    type="text"
                    value={newProduct.sku}
                    onChange={(e) => setNewProduct({ ...newProduct, sku: normalizeSkuValue(e.target.value) })}
                    autoFocus
                    className={`w-full bg-[#232226] border p-3 rounded text-base text-gray-300 ${existingSkuProduct ? 'border-red-400/60' : 'border-[#5A595E]'}`}
                    placeholder="Enter or scan product code"
                    required
                  />
                  {existingSkuProduct && (
                    <div className="text-[12px] uppercase tracking-[0.12em] text-red-300">
                      {`SKU already exists: ${existingSkuProduct.name}`}
                    </div>
                  )}
                </div>
              <div className="space-y-1 relative">
                <label className="text-[13px] text-gray-500 uppercase font-bold">Category</label>
                <input
                  type="text"
                  value={newProduct.category}
                  onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                  onFocus={() => setShowCategorySuggestions(true)}
                  onBlur={() => setTimeout(() => setShowCategorySuggestions(false), 120)}
                  className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-base text-white"
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
                          className="flex w-full items-center justify-between px-4 py-3 text-left text-base text-gray-200 transition hover:bg-[#F2C4CE]/10 hover:text-white"
                        >
                          <span>{category}</span>
                          <span className="text-[12px] uppercase tracking-[0.12em] text-gray-500">Existing</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
                <div className="space-y-1 relative">
                <label className="text-[13px] text-gray-500 uppercase font-bold">Unit Of Measure</label>
                <button
                  type="button"
                  onClick={() => setShowUnitOfMeasureMenu((current) => !current)}
                  onBlur={() => setTimeout(() => setShowUnitOfMeasureMenu(false), 120)}
                  className={`flex w-full items-center justify-between rounded border px-3 py-3 text-left text-base transition ${showUnitOfMeasureMenu ? 'border-[#F2C4CE] bg-[#2A292D] text-white shadow-[0_0_0_1px_rgba(242,196,206,0.18)]' : 'border-[#5A595E] bg-[#2C2B30] text-white'}`}
                >
                  <span>{newProduct.unitOfMeasure}</span>
                  <span className={`text-sm transition ${showUnitOfMeasureMenu ? 'rotate-180 text-[#F2C4CE]' : 'text-gray-400'}`}>▾</span>
                </button>
                {showUnitOfMeasureMenu && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-xl border border-[#5A595E] bg-[#2A292D] shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                    <div className="max-h-56 overflow-y-auto custom-scrollbar py-2">
                      {unitOfMeasureOptions.map((unit) => (
                        <button
                          key={unit}
                          type="button"
                          onMouseDown={() => {
                            setNewProduct({ ...newProduct, unitOfMeasure: unit });
                            setShowUnitOfMeasureMenu(false);
                          }}
                          className={`flex w-full items-center justify-between px-4 py-3 text-left text-base transition ${newProduct.unitOfMeasure === unit ? 'bg-[#F2C4CE]/12 text-white' : 'text-gray-200 hover:bg-[#F2C4CE]/10 hover:text-white'}`}
                        >
                          <span>{unit}</span>
                          {newProduct.unitOfMeasure === unit && (
                            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#F2C4CE]">Selected</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-1"><label className="text-[13px] text-gray-500 uppercase font-bold">Unit Price</label><input type="number" min="0" value={newProduct.price} onChange={(e) => setNewProduct({ ...newProduct, price: Math.max(0, Number(e.target.value) || 0) })} className="no-number-spinner w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-base text-white" required /></div>
              <div className="space-y-1"><label className="text-[13px] text-gray-500 uppercase font-bold">Low Stock Threshold</label><input type="number" min="0" value={newProduct.reorderThreshold} onChange={(e) => setNewProduct({ ...newProduct, reorderThreshold: Math.max(0, Number(e.target.value) || 0) })} className="no-number-spinner w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-base text-white" required /></div>
              </div>
              <div className="flex gap-4 pt-4">
                <button type="submit" disabled={Boolean(existingSkuProduct)} className="flex-1 bg-[#F58F7C] text-[#2C2B30] font-bold py-4 rounded text-base uppercase shadow-lg hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">{editingProductId ? 'Save Product' : 'Create Product'}</button>
                <button type="button" onClick={() => { resetProductForm(); setShowProductModal(false); }} className="flex-1 border border-[#5A595E] text-gray-400 font-bold py-4 rounded text-base uppercase hover:bg-white/5 transition">Cancel</button>
              </div>
          </form>
        </div>
      )}
      {accountingActionTarget && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-[#5A595E] bg-[linear-gradient(180deg,rgba(60,58,64,0.98)_0%,rgba(48,46,52,0.98)_100%)] shadow-[0_24px_70px_rgba(0,0,0,0.42)]">
            <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(242,196,206,0.12),transparent_45%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0))] px-8 py-6">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <div className="inline-flex rounded-full border border-[#F2C4CE]/25 bg-[#F2C4CE]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#F2C4CE]">
                    {accountingActionTarget.action === 'COLLECT'
                      ? 'Collection Review'
                      : accountingActionTarget.action === 'RELEASE_ESCROW'
                        ? 'Escrow Release'
                        : accountingActionTarget.action === 'RETRY_DISBURSEMENT'
                          ? 'Supplier Retry'
                          : 'Supplier Escrow'}
                  </div>
                  <h3 className="mt-4 text-xl font-black uppercase tracking-[0.12em] text-white">
                    {accountingActionTarget.action === 'COLLECT'
                      ? 'Confirm Collection'
                      : accountingActionTarget.action === 'RELEASE_ESCROW'
                        ? 'Release Escrow Payment'
                        : accountingActionTarget.action === 'RETRY_DISBURSEMENT'
                          ? 'Retry Supplier Disbursement'
                          : 'Fund Supplier Escrow'}
                  </h3>
                  <p className="mt-3 max-w-lg text-[14px] leading-7 text-gray-300">
                    {accountingActionTarget.action === 'COLLECT'
                      ? 'Record this customer payment and lock it into the visible ledger.'
                      : accountingActionTarget.action === 'RELEASE_ESCROW'
                        ? 'Review the payout details one last time before releasing the held supplier funds.'
                        : 'Review the payable, confirm the supplier payout destination, and move the funds into the secured disbursement flow.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeAccountingActionModal}
                  className="rounded-2xl border border-white/10 bg-white/5 p-3 text-gray-300 transition hover:bg-white/10 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="space-y-5 px-8 py-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-[#2B2A2F] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">Party</div>
                  <div className="mt-3 text-lg font-black leading-8 text-white">
                    {accountingActionTarget.order.orderType === 'Inbound'
                      ? (accountingActionTarget.order.supplier?.name || 'No supplier')
                      : 'Customer Sale'}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#2B2A2F] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">Amount</div>
                  <div className="mt-3 text-2xl font-black tracking-tight text-[#F7C0B4]">
                    {formatCurrency(accountingActionTarget.order.orderType === 'Inbound'
                      ? accountingActionTarget.order.expenseAmount
                      : accountingActionTarget.order.receivableAmount)}
                  </div>
                </div>
              </div>
              {accountingActionTarget.order.orderType === 'Inbound' && (
                (() => {
                  const supplierPaymentOption = getSupplierDisbursementPaymentOption(accountingActionTarget.order.supplier);
                  const SupplierPaymentIcon = supplierPaymentOption.icon;
                  const isSelected = selectedAccountingPaymentMethod === supplierPaymentOption.id;
                  const renderSupplierPaymentLogo = () => {
                    if (supplierPaymentOption.logo === 'gcash') {
                      return <img src={gcashLogo} alt="GCash" className="h-8 w-8 object-contain" />;
                    }

                    if (supplierPaymentOption.logo === 'maya') {
                      return <img src={mayaLogo} alt="Maya" className="h-8 w-8 object-contain" />;
                    }

                    if (supplierPaymentOption.logo === 'card') {
                      return <img src={cardBrandsLogo} alt="Credit and debit cards" className="h-7 w-10 object-contain" />;
                    }

                    return SupplierPaymentIcon ? <SupplierPaymentIcon className="h-6 w-6" /> : null;
                  };

                  return (
                    <div className="space-y-4 rounded-xl border border-white/10 bg-[#26252A] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">Choose A Payment Method</div>
                        <div className="mt-2 text-base font-black text-white">Payment method of the supplier</div>
                        <div className="mt-2 text-[13px] leading-6 text-gray-400">
                          The saved primary payout method is preselected so your disbursement flow matches the supplier profile automatically.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedAccountingPaymentMethod(supplierPaymentOption.id)}
                        className={`flex w-full items-center gap-4 rounded-2xl border px-4 py-4 text-left transition ${
                          isSelected
                            ? `${supplierPaymentOption.accentClass} shadow-[0_14px_35px_rgba(0,0,0,0.18)]`
                            : 'border-white/10 bg-[#312F35] hover:border-white/20 hover:bg-white/5'
                        }`}
                      >
                        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${isSelected ? supplierPaymentOption.iconClass : 'bg-white/10 text-white'}`}>
                          {renderSupplierPaymentLogo()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-base font-black text-white">{supplierPaymentOption.label}</div>
                          <div className="mt-1 text-sm leading-7 text-gray-300">{supplierPaymentOption.description}</div>
                          <div className="mt-2 text-[12px] uppercase tracking-[0.14em] text-gray-500">{supplierPaymentOption.detail}</div>
                        </div>
                        <div className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${isSelected ? 'border-white bg-white' : 'border-gray-500'}`}>
                          {isSelected ? <div className="h-2.5 w-2.5 rounded-full bg-[#232226]" /> : null}
                        </div>
                      </button>
                    </div>
                  );
                })()
              )}
            </div>
            <div className="flex gap-4 border-t border-white/10 bg-[#302E34]/80 px-8 py-5">
              <button
                type="button"
                onClick={confirmAccountingAction}
                className="flex-1 rounded-2xl border border-[#F2C4CE]/35 bg-[linear-gradient(180deg,rgba(242,196,206,0.18),rgba(242,196,206,0.08))] px-4 py-4 text-base font-black uppercase tracking-[0.12em] text-[#F2C4CE] transition hover:bg-[linear-gradient(180deg,rgba(242,196,206,0.26),rgba(242,196,206,0.14))] hover:text-white"
              >
                {accountingActionTarget.action === 'COLLECT'
                  ? 'Confirm Collection'
                  : accountingActionTarget.action === 'RELEASE_ESCROW'
                    ? 'Release Payment'
                  : accountingActionTarget.action === 'RETRY_DISBURSEMENT'
                    ? 'Retry Disbursement'
                    : 'Disbursement'}
              </button>
              <button
                type="button"
                onClick={closeAccountingActionModal}
                className="flex-1 rounded-2xl border border-[#5A595E] bg-white/[0.02] py-4 text-base font-black uppercase tracking-[0.12em] text-gray-300 transition hover:bg-white/5 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {showDeleteProductModal && productPendingDelete && (
        <div className="fixed inset-0 z-[105] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
          <div className="w-full max-w-lg rounded-2xl border border-[#5A595E] bg-[#36353A] p-8 shadow-2xl">
            <div className="border-b border-white/10 pb-4">
              <h3 className="text-base font-bold uppercase tracking-[0.12em] text-[#F58F7C]">Remove Product</h3>
            </div>
            <div className="space-y-4 py-6">
              <p className="text-lg font-bold text-white">{productPendingDelete.name}</p>
              <div className="rounded-xl border border-white/10 bg-[#2C2B30] p-4 text-base text-gray-300">
                Removing this product will delete it from the inventory list. This action cannot be undone.
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm uppercase tracking-[0.12em] text-gray-500">
                <div>
                  <div className="font-bold">SKU</div>
                  <div className="mt-2 text-base normal-case tracking-normal text-white">{productPendingDelete.sku}</div>
                </div>
                <div>
                  <div className="font-bold">Category</div>
                  <div className="mt-2 text-base normal-case tracking-normal text-white">{productPendingDelete.category}</div>
                </div>
              </div>
            </div>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={confirmDeleteProduct}
                className="flex-1 rounded border border-red-400/50 bg-red-500/10 py-4 text-base font-bold uppercase text-red-200 transition hover:bg-red-500/20"
              >
                Remove
              </button>
              <button
                type="button"
                onClick={closeDeleteProductModal}
                className="flex-1 rounded border border-[#5A595E] py-4 text-base font-bold uppercase text-gray-300 transition hover:bg-white/5"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {showSupplierModal && user.role === 'SuperAdmin' && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <form onSubmit={handleSupplierSubmit} autoComplete="off" className="bg-[#36353A] border border-[#5A595E] p-8 rounded-2xl w-full max-w-2xl space-y-5 shadow-2xl">
            <h3 className="text-base font-bold text-[#F2C4CE] uppercase tracking-[0.12em] border-b border-white/10 pb-4">{editingSupplierId ? 'Edit Supplier' : 'Register Supplier'}</h3>
            <input type="text" name="username" autoComplete="username" tabIndex={-1} className="hidden" />
            <input type="password" name="password" autoComplete="current-password" tabIndex={-1} className="hidden" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1"><label className="text-[13px] text-gray-500 uppercase font-bold">Supplier Name</label><input type="text" name="supplier_name" autoComplete="section-supplier off" value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-base text-white" required /></div>
              <div className="space-y-1"><label className="text-[13px] text-gray-500 uppercase font-bold">Contact Person</label><input type="text" name="supplier_contact_person" autoComplete="section-supplier off" value={supplierForm.contactPerson} onChange={(e) => setSupplierForm({ ...supplierForm, contactPerson: e.target.value })} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-base text-white" /></div>
              <div className="space-y-1"><label className="text-[13px] text-gray-500 uppercase font-bold">Email Address</label><input type="email" name="supplier_email" autoComplete="section-supplier off" value={supplierForm.email} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-base text-white" required /></div>
              <div className="space-y-1"><label className="text-[13px] text-gray-500 uppercase font-bold">Phone Number</label><input type="text" name="supplier_phone" autoComplete="section-supplier off" value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-base text-white" required /></div>
              <div className="space-y-1 md:col-span-2"><label className="text-[13px] text-gray-500 uppercase font-bold">Address</label><input type="text" name="supplier_address" autoComplete="section-supplier off" value={supplierForm.address} onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-base text-white" /></div>
              <div className="space-y-1"><label className="text-[13px] text-gray-500 uppercase font-bold">Lead Time (Days)</label><input type="number" name="supplier_lead_time" autoComplete="off" min="0" value={supplierForm.leadTimeDays} onChange={(e) => setSupplierForm({ ...supplierForm, leadTimeDays: Math.max(0, Number(e.target.value) || 0) })} className="no-number-spinner w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-base text-white" /></div>
              <div className="space-y-1"><label className="text-[13px] text-gray-500 uppercase font-bold">{editingSupplierId ? 'New Password' : 'Password'}</label><input type="password" name="supplier_password" autoComplete="new-password" minLength={6} value={supplierForm.password} onChange={(e) => setSupplierForm({ ...supplierForm, password: e.target.value })} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-base text-white" placeholder={editingSupplierId ? ((suppliers.find((supplier) => supplier._id === editingSupplierId)?.accountUser) ? 'Leave blank to keep current password' : 'Required to create supplier account') : 'Set supplier login password'} required={!editingSupplierId || !suppliers.find((supplier) => supplier._id === editingSupplierId)?.accountUser} /></div>
            </div>
            <div className="flex gap-4 pt-4">
              <button type="submit" className="flex-1 bg-[#F2C4CE] text-[#2C2B30] font-bold py-4 rounded text-base uppercase shadow-lg hover:brightness-110">{editingSupplierId ? 'Save Supplier' : 'Create Supplier'}</button>
              <button type="button" onClick={() => { resetSupplierForm(); setShowSupplierModal(false); }} className="flex-1 border border-[#5A595E] text-gray-400 font-bold py-4 rounded text-base uppercase hover:bg-white/5 transition">Cancel</button>
            </div>
          </form>
        </div>
      )}
      {showSupplierPaymentMethodModal && user.role === 'Supplier' && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <form onSubmit={saveSupplierPaymentMethodDraft} className="bg-[#36353A] border border-[#5A595E] p-8 rounded-2xl w-full max-w-2xl space-y-5 shadow-2xl">
            <h3 className="text-base font-bold text-[#F2C4CE] uppercase tracking-[0.12em] border-b border-white/10 pb-4">
              {editingSupplierPaymentMethodIndex !== null ? 'Edit Payment Method' : 'Add Payment Method'}
            </h3>
            <p className="text-[13px] text-gray-500">Add the real account or wallet Lumiere should use when sending payouts to your business.</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[13px] text-gray-500 uppercase font-bold">Payout Type</label>
                <select value={supplierPaymentMethodDraft.methodType} onChange={(e) => handleSupplierPaymentMethodDraftChange('methodType', e.target.value)} className="w-full rounded-lg border border-[#5A595E] bg-[#232226] p-3 text-base text-white">
                  <option value="bank_account">Bank Account</option>
                  <option value="ewallet">E-Wallet</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[13px] text-gray-500 uppercase font-bold">{supplierPaymentMethodDraft.methodType === 'ewallet' ? 'Wallet Provider' : 'Bank'}</label>
                <select value={supplierPaymentMethodDraft.providerCode} onChange={(e) => handleSupplierPaymentMethodDraftChange('providerCode', e.target.value)} className="w-full rounded-lg border border-[#5A595E] bg-[#232226] p-3 text-base text-white">
                  {(supplierPayoutOptions[supplierPaymentMethodDraft.methodType] || []).map((option) => (
                    <option key={option.code} value={option.code}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[13px] text-gray-500 uppercase font-bold">Account Name</label>
                <input value={supplierPaymentMethodDraft.accountName} onChange={(e) => handleSupplierPaymentMethodDraftChange('accountName', e.target.value)} className="w-full rounded-lg border border-[#5A595E] bg-[#232226] p-3 text-base text-white" placeholder="Registered bank or wallet account name" required />
              </div>
              <div className="space-y-1">
                <label className="text-[13px] text-gray-500 uppercase font-bold">{supplierPaymentMethodDraft.methodType === 'ewallet' ? 'Mobile Number' : 'Account Number'}</label>
                <input value={supplierPaymentMethodDraft.accountNumber} onChange={(e) => handleSupplierPaymentMethodDraftChange('accountNumber', e.target.value)} inputMode="numeric" pattern="[0-9]*" className="w-full rounded-lg border border-[#5A595E] bg-[#232226] p-3 text-base text-white" placeholder={supplierPaymentMethodDraft.methodType === 'ewallet' ? '09XXXXXXXXX' : 'Bank account number'} required />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-[13px] text-gray-500 uppercase font-bold">Payout Notes</label>
                <input value={supplierPaymentMethodDraft.notes} onChange={(e) => handleSupplierPaymentMethodDraftChange('notes', e.target.value)} className="w-full rounded-lg border border-[#5A595E] bg-[#232226] p-3 text-base text-white" placeholder="Optional notes like branch, payout reference, or receiving instructions" />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="inline-flex items-center gap-3 text-[14px] text-gray-300">
                  <input
                    type="checkbox"
                    checked={supplierPaymentMethodDraft.isPrimary}
                    onChange={(e) => handleSupplierPaymentMethodDraftChange('isPrimary', e.target.checked)}
                    className="h-4 w-4 rounded border-[#5A595E] bg-[#232226] text-[#F2C4CE] focus:ring-[#F2C4CE]"
                  />
                  Set as primary payout method
                </label>
              </div>
            </div>
            <div className="flex gap-4 pt-4">
              <button type="submit" className="flex-1 bg-[#F2C4CE] text-[#2C2B30] font-bold py-4 rounded text-base uppercase shadow-lg hover:brightness-110">
                {editingSupplierPaymentMethodIndex !== null ? 'Save Changes' : 'Add Payment Method'}
              </button>
              <button type="button" onClick={closeSupplierPaymentMethodModal} className="flex-1 border border-[#5A595E] text-gray-400 font-bold py-4 rounded text-base uppercase hover:bg-white/5 transition">Cancel</button>
            </div>
          </form>
        </div>
      )}
      {showDeleteSupplierPaymentMethodModal && supplierPaymentMethodPendingDeleteIndex !== null && supplierPaymentMethods[supplierPaymentMethodPendingDeleteIndex] && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <div className="bg-[#36353A] border border-[#5A595E] p-8 rounded-2xl w-full max-w-xl space-y-5 shadow-2xl">
            <h3 className="text-base font-bold text-[#F58F7C] uppercase tracking-[0.12em] border-b border-white/10 pb-4">Remove Payment Method</h3>
            <div className="space-y-3">
              <div className="text-2xl font-bold text-white">
                {supplierPaymentMethods[supplierPaymentMethodPendingDeleteIndex].methodName || 'Saved payment method'}
              </div>
              <div className="text-base text-gray-300">
                {[supplierPaymentMethods[supplierPaymentMethodPendingDeleteIndex].accountName, supplierPaymentMethods[supplierPaymentMethodPendingDeleteIndex].accountNumber].filter(Boolean).join(' • ')}
              </div>
              <p className="pt-2 text-base leading-7 text-gray-300">
                This payout method will be removed from your supplier account and can no longer be used for Xendit disbursements.
              </p>
            </div>
            <div className="flex gap-4 pt-4">
              <button type="button" onClick={confirmDeleteSupplierPaymentMethod} className="flex-1 bg-[#F58F7C] text-[#2C2B30] font-bold py-4 rounded text-base uppercase shadow-lg hover:brightness-110">
                Remove
              </button>
              <button type="button" onClick={closeDeleteSupplierPaymentMethodModal} className="flex-1 border border-[#5A595E] text-gray-400 font-bold py-4 rounded text-base uppercase hover:bg-white/5 transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {showWarehouseModal && user.role === 'SuperAdmin' && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <form onSubmit={handleWarehouseSubmit} className="bg-[#36353A] border border-[#5A595E] p-8 rounded-2xl w-full max-w-xl space-y-5 shadow-2xl">
            <h3 className="text-base font-bold text-[#F58F7C] uppercase tracking-[0.12em] border-b border-white/10 pb-4">{editingWarehouseId ? 'Edit Warehouse' : 'Register Warehouse'}</h3>
            <div className="space-y-4">
              <div className="space-y-1"><label className="text-[13px] text-gray-500 uppercase font-bold">Warehouse Name</label><input type="text" value={warehouseForm.name} onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-base text-white" required /></div>
              <div className="space-y-1"><label className="text-[13px] text-gray-500 uppercase font-bold">Address</label><input type="text" value={warehouseForm.address} onChange={(e) => setWarehouseForm({ ...warehouseForm, address: e.target.value })} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-base text-white" /></div>
              <div className="space-y-1">
                <label className="text-[13px] text-gray-500 uppercase font-bold">Assigned Manager</label>
                <select value={warehouseForm.manager} onChange={(e) => setWarehouseForm({ ...warehouseForm, manager: e.target.value })} className="w-full bg-[#2C2B30] border border-[#5A595E] p-3 rounded text-base text-white">
                  <option value="">Unassigned</option>
                  {managerUsers.map((manager) => (
                    <option key={manager._id} value={manager._id}>{manager.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-4 pt-4">
              <button type="submit" className="flex-1 bg-[#F58F7C] text-[#2C2B30] font-bold py-4 rounded text-base uppercase shadow-lg hover:brightness-110">{editingWarehouseId ? 'Save Warehouse' : 'Create Warehouse'}</button>
              <button type="button" onClick={() => { resetWarehouseForm(); setShowWarehouseModal(false); }} className="flex-1 border border-[#5A595E] text-gray-400 font-bold py-4 rounded text-base uppercase hover:bg-white/5 transition">Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default App;



