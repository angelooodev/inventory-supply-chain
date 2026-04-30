import { useState, useEffect } from 'react';
import axios from 'axios';

const AddProduct = ({ onProductAdded }) => {
    const [formData, setFormData] = useState({
        name: '', sku: '', category: '', currentStock: 0, reorderThreshold: 10, price: 0, supplier: ''
    });
    const [suppliers, setSuppliers] = useState([]);

    useEffect(() => {
        // Fetch suppliers so we can choose one in the dropdown
        axios.get('http://localhost:5000/api/suppliers')
            .then(res => setSuppliers(res.data));
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await axios.post('http://localhost:5000/api/products', formData);
            onProductAdded(); // Refresh the list
            alert("SYSTEM_MESSAGE: PRODUCT_REGISTERED");
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="bg-surface p-6 rounded border border-primary/30 mt-6 space-y-4">
            <h2 className="text-primary font-bold">&gt; REGISTER_NEW_ITEM</h2>
            <div className="grid grid-cols-2 gap-4">
                <input 
                    type="text" placeholder="Item Name" 
                    className="bg-background border border-gray-600 p-2 rounded focus:border-primary outline-none"
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                />
                <input 
                    type="text" placeholder="SKU" 
                    className="bg-background border border-gray-600 p-2 rounded focus:border-primary outline-none"
                    onChange={(e) => setFormData({...formData, sku: e.target.value})}
                />
                <select 
                    className="bg-background border border-gray-600 p-2 rounded text-gray-400"
                    onChange={(e) => setFormData({...formData, supplier: e.target.value})}
                >
                    <option value="">Select Supplier</option>
                    {suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                </select>
                <input 
                    type="number" placeholder="Price" 
                    className="bg-background border border-gray-600 p-2 rounded focus:border-primary outline-none"
                    onChange={(e) => setFormData({...formData, price: e.target.value})}
                />
            </div>
            <button type="submit" className="w-full bg-primary text-background font-bold py-2 rounded hover:opacity-90">
                EXECUTE_CREATE
            </button>
        </form>
    );
};

export default AddProduct;