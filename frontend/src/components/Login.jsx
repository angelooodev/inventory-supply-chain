import { useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const Login = ({ setAuthUser }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_BASE}/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('lumiere_user', JSON.stringify(data));
        setAuthUser(data);
      } else {
        setError(data.message || 'Login failed. Please check your credentials.');
      }
    } catch (err) {
      setError('Connection error. Is the backend running?');
    }
  };

  return (
    <div className="min-h-screen bg-[#2C2B30] flex items-center justify-center relative overflow-hidden font-mono text-gray-200">
      <div className="absolute inset-0 bg-grid opacity-30"></div>
      
      <form onSubmit={handleSubmit} className="z-10 bg-[#36353A]/80 backdrop-blur-xl border border-[#5A595E] p-10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#F58F7C] to-[#F2C4CE] mx-auto mb-4 flex items-center justify-center">
             <span className="text-[#2C2B30] font-black text-xl">L</span>
          </div>
          <h1 className="text-2xl font-bold text-[#F2C4CE] tracking-tight">Lumière Neon</h1>
          <p className="text-[10px] text-gray-500 uppercase mt-2 tracking-widest">Inventory Management System</p>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/50 text-red-400 text-[10px] p-3 rounded mb-6 text-center font-bold">{error}</div>}

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] text-gray-500 uppercase font-bold">Email Address</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-[#232226] border border-[#5A595E] p-3 rounded text-xs focus:border-[#F2C4CE] outline-none transition" placeholder="manager@lumiere.io" required />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-gray-500 uppercase font-bold">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-[#232226] border border-[#5A595E] p-3 rounded text-xs focus:border-[#F2C4CE] outline-none transition" placeholder="Enter password" required />
          </div>
        </div>

        <button type="submit" className="w-full bg-[#F2C4CE] text-[#2C2B30] font-black py-4 rounded-lg mt-8 text-xs uppercase tracking-widest hover:brightness-110 transition shadow-lg">
          Login to Dashboard
        </button>
      </form>
    </div>
  );
};

export default Login;
