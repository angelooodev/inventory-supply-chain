import { useState } from 'react';
import { fetchProducts } from './api/inventory';

function App() {
  const [products, setProducts] = useState([]);

  const loadData = async () => {
    const data = await fetchProducts();
    setProducts(data);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-textmain font-mono">
      <div className="bg-surface p-8 rounded-lg shadow-2xl max-w-2xl w-full border-l-4 border-primary">
        
        <div className="flex justify-between items-center mb-6 border-b border-gray-600 pb-4">
          <h1 className="text-2xl font-bold text-primary tracking-wider">
            &gt; SYS_ADMIN // GROUP_03
          </h1>
        </div>

        <div className="space-y-4">
          <button 
            onClick={loadData}
            className="bg-primary text-background font-bold py-2 px-6 rounded hover:bg-white transition"
          >
            INITIALIZE_DATA
          </button>

          <div className="mt-6 space-y-2">
            {products.map(product => (
              <div key={product._id} className="p-3 border border-gray-600 rounded bg-background flex justify-between">
                <span className="text-primary">{product.name}</span>
                <span className="text-secondary">STOCK: {product.currentStock}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;