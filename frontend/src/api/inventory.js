const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const parseJsonResponse = async (response) => {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Request failed.');
  }
  return data;
};

// Helper to get token from storage
const getAuthHeader = () => {
  const user = JSON.parse(localStorage.getItem('lumiere_user'));
  return user ? { 'Authorization': `Bearer ${user.token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
};

export const fetchProducts = async () => {
    const res = await fetch(`${BASE_URL}/products`, { headers: getAuthHeader() });
    return parseJsonResponse(res);
};

export const fetchOrders = async () => {
    const res = await fetch(`${BASE_URL}/orders`, { headers: getAuthHeader() }); // Protected[cite: 2]
    return parseJsonResponse(res);
};

export const createOrder = async (orderData) => {
    const res = await fetch(`${BASE_URL}/orders`, {
        method: 'POST',
        headers: getAuthHeader(), // Protected[cite: 2]
        body: JSON.stringify(orderData)
    });
    return parseJsonResponse(res);
};

export const createProduct = async (productData) => {
    const res = await fetch(`${BASE_URL}/products`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: JSON.stringify(productData)
    });
    return parseJsonResponse(res);
};

export const importProducts = async (fileName, fileData) => {
    const res = await fetch(`${BASE_URL}/products/import`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: JSON.stringify({ fileName, fileData })
    });
    return parseJsonResponse(res);
};

export const downloadProductImportTemplate = async () => {
    const res = await fetch(`${BASE_URL}/products/import-template`, {
        headers: getAuthHeader(),
    });

    if (!res.ok) {
        let errorMessage = 'Template download failed.';
        try {
            const data = await res.json();
            errorMessage = data.message || errorMessage;
        } catch (error) {
            // Ignore JSON parsing errors for binary responses.
        }
        throw new Error(errorMessage);
    }

    return res.blob();
};

export const updateProduct = async (id, productData) => {
    const res = await fetch(`${BASE_URL}/products/${id}`, {
        method: 'PUT',
        headers: getAuthHeader(),
        body: JSON.stringify(productData)
    });
    return parseJsonResponse(res);
};

export const deleteProduct = async (id) => {
    const res = await fetch(`${BASE_URL}/products/${id}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
    });
    return parseJsonResponse(res);
};

export const updateOrderStatus = async (id, status) => {
    const res = await fetch(`${BASE_URL}/orders/${id}`, {
        method: 'PUT',
        headers: getAuthHeader(), // Protected[cite: 2]
        body: JSON.stringify({ status })
    });
    return parseJsonResponse(res);
};

export const updateOrderAccounting = async (id, action, options = {}) => {
    const res = await fetch(`${BASE_URL}/orders/${id}/accounting`, {
        method: 'PUT',
        headers: getAuthHeader(),
        body: JSON.stringify({ action, ...options }),
    });
    return parseJsonResponse(res);
};

export const fetchPurchaseOrderForOrder = async (orderId) => {
    const res = await fetch(`${BASE_URL}/purchase-orders/order/${orderId}`, {
        headers: getAuthHeader(),
    });
    return parseJsonResponse(res);
};

export const signPurchaseOrder = async (orderId, payload) => {
    const res = await fetch(`${BASE_URL}/purchase-orders/order/${orderId}/sign`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: JSON.stringify(payload),
    });
    return parseJsonResponse(res);
};

export const fetchTransferOrderForOrder = async (orderId) => {
    const res = await fetch(`${BASE_URL}/transfer-orders/order/${orderId}`, {
        headers: getAuthHeader(),
    });
    return parseJsonResponse(res);
};

export const signTransferOrder = async (orderId, payload) => {
    const res = await fetch(`${BASE_URL}/transfer-orders/order/${orderId}/sign`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: JSON.stringify(payload),
    });
    return parseJsonResponse(res);
};

export const fetchSupplierPurchaseOrder = async (token) => {
    const res = await fetch(`${BASE_URL}/purchase-orders/supplier/${token}`);
    return parseJsonResponse(res);
};

export const signSupplierPurchaseOrder = async (token, payload) => {
    const res = await fetch(`${BASE_URL}/purchase-orders/supplier/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return parseJsonResponse(res);
};

export const fetchSuppliers = async () => {
    const res = await fetch(`${BASE_URL}/suppliers`);
    return parseJsonResponse(res);
};

export const createSupplier = async (supplierData) => {
    const res = await fetch(`${BASE_URL}/suppliers`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: JSON.stringify(supplierData)
    });
    return parseJsonResponse(res);
};

export const updateSupplier = async (id, supplierData) => {
    const res = await fetch(`${BASE_URL}/suppliers/${id}`, {
        method: 'PUT',
        headers: getAuthHeader(),
        body: JSON.stringify(supplierData)
    });
    return parseJsonResponse(res);
};

export const deleteSupplier = async (id) => {
    const res = await fetch(`${BASE_URL}/suppliers/${id}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
    });
    return parseJsonResponse(res);
};

export const createOrUpdateSupplierAccount = async (id, accountData) => {
    const res = await fetch(`${BASE_URL}/suppliers/${id}/account`, {
        method: 'PUT',
        headers: getAuthHeader(),
        body: JSON.stringify(accountData)
    });
    return parseJsonResponse(res);
};

export const fetchOwnSupplierProfile = async () => {
    const res = await fetch(`${BASE_URL}/suppliers/me`, { headers: getAuthHeader() });
    return parseJsonResponse(res);
};

export const updateOwnSupplierPaymentMethods = async (paymentMethods) => {
    const res = await fetch(`${BASE_URL}/suppliers/me/payment-methods`, {
        method: 'PUT',
        headers: getAuthHeader(),
        body: JSON.stringify({ paymentMethods }),
    });
    return parseJsonResponse(res);
};

export const fetchWarehouses = async () => {
    const res = await fetch(`${BASE_URL}/warehouses`, { headers: getAuthHeader() });
    return parseJsonResponse(res);
};

export const createWarehouse = async (warehouseData) => {
    const res = await fetch(`${BASE_URL}/warehouses`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: JSON.stringify(warehouseData)
    });
    return parseJsonResponse(res);
};

export const updateWarehouse = async (id, warehouseData) => {
    const res = await fetch(`${BASE_URL}/warehouses/${id}`, {
        method: 'PUT',
        headers: getAuthHeader(),
        body: JSON.stringify(warehouseData)
    });
    return parseJsonResponse(res);
};

export const deleteWarehouse = async (id) => {
    const res = await fetch(`${BASE_URL}/warehouses/${id}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
    });
    return parseJsonResponse(res);
};
