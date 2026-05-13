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
    const res = await fetch(`${BASE_URL}/products`);
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

export const updateOrderStatus = async (id, status) => {
    const res = await fetch(`${BASE_URL}/orders/${id}`, {
        method: 'PUT',
        headers: getAuthHeader(), // Protected[cite: 2]
        body: JSON.stringify({ status })
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

export const fetchWarehouses = async () => {
    const res = await fetch(`${BASE_URL}/warehouses`);
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
