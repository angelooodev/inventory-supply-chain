const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

// Helper to get token from storage
const getAuthHeader = () => {
  const user = JSON.parse(localStorage.getItem('lumiere_user'));
  return user ? { 'Authorization': `Bearer ${user.token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
};

export const fetchProducts = async () => {
    const res = await fetch(`${BASE_URL}/products`);
    return res.json();
};

export const fetchOrders = async () => {
    const res = await fetch(`${BASE_URL}/orders`, { headers: getAuthHeader() }); // Protected[cite: 2]
    return res.json();
};

export const createOrder = async (orderData) => {
    const res = await fetch(`${BASE_URL}/orders`, {
        method: 'POST',
        headers: getAuthHeader(), // Protected[cite: 2]
        body: JSON.stringify(orderData)
    });
    return res.json();
};

export const updateOrderStatus = async (id, status) => {
    const res = await fetch(`${BASE_URL}/orders/${id}`, {
        method: 'PUT',
        headers: getAuthHeader(), // Protected[cite: 2]
        body: JSON.stringify({ status })
    });
    return res.json();
};

export const fetchSuppliers = async () => {
    const res = await fetch(`${BASE_URL}/suppliers`);
    return res.json();
};
