const BASE_URL = 'http://localhost:5000/api';

export const fetchProducts = async () => {
    const res = await fetch(`${BASE_URL}/products`);
    return res.json();
};

export const fetchSuppliers = async () => {
    const res = await fetch(`${BASE_URL}/suppliers`);
    return res.json();
};

export const fetchOrders = async () => {
    const res = await fetch(`${BASE_URL}/orders`);
    return res.json();
};

export const createOrder = async (orderData) => {
    const res = await fetch(`${BASE_URL}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
    });
    return res.json();
};

export const updateOrderStatus = async (id, status) => {
    const res = await fetch(`${BASE_URL}/orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
    });
    return res.json();
};