import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Wallet, PlusCircle, LayoutList, BrainCircuit, MessageSquare, LogOut, ArrowUpDown, Trash2, Edit, ThumbsUp, ThumbsDown, Search, X, Send } from 'lucide-react';

// --- Configuration ---
const API_BASE_URL = 'http://127.0.0.1:8000';
const CATEGORIES = ["Food", "Transport", "Shopping", "Utilities", "Entertainment", "Health", "Other"];

// --- Helper Functions ---
const formatINR = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

// --- API Helper ---
const apiFetch = async (endpoint, options = {}) => {
  const { body, token, ...customOptions } = options;
  const headers = { 'Content-Type': 'application/json', ...customOptions.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const config = { ...customOptions, headers };
  if (body) config.body = JSON.stringify(body);

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: `HTTP error! Status: ${response.status}` }));
      throw new Error(errorData.detail);
    }
    if (response.status === 204 || response.headers.get('content-length') === '0') return null;
    return response.json();
  } catch (error) {
    console.error(`API Fetch Error (${endpoint}):`, error);
    if (error instanceof TypeError) throw new Error('Could not connect to the server. Please ensure the backend is running.');
    throw error;
  }
};


// --- UI Components ---
const Header = ({ onLogout }) => (
    <header className="bg-gray-800 text-white p-4 flex justify-between items-center shadow-md sticky top-0 z-20">
        <div className="flex items-center space-x-3">
            <Wallet size={32} className="text-green-400" />
            <div><h1 className="text-2xl font-bold">Brokemate</h1><p className="text-sm text-gray-400">Personal Expense Manager</p></div>
        </div>
        <button onClick={onLogout} className="flex items-center space-x-2 px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg transition-colors"><LogOut size={18} /><span>Logout</span></button>
    </header>
);

const TabButton = ({ icon: Icon, label, isActive, onClick }) => (
    <button onClick={onClick} className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 text-sm font-medium rounded-lg transition-all duration-200 ${isActive ? 'bg-green-500 text-white shadow-lg' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
        <Icon size={18} /><span>{label}</span>
    </button>
);

const Card = ({ children, className = '' }) => <div className={`bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700 ${className}`}>{children}</div>;
const LoadingSpinner = () => <div className="flex justify-center items-center h-full p-8"><div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-green-500"></div></div>;
const ErrorDisplay = ({ message, onClear }) => !message ? null : (
    <div className="bg-red-500/20 border border-red-500 text-red-300 px-4 py-3 rounded-lg relative my-4" role="alert">
        <strong className="font-bold">Error: </strong><span className="block sm:inline">{message}</span>
        <span className="absolute top-0 bottom-0 right-0 px-4 py-3" onClick={onClear}><X size={18} className="cursor-pointer" /></span>
    </div>
);
const Modal = ({ isOpen, onClose, title, children }) => !isOpen ? null : (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4" onClick={onClose}>
        <div className="bg-gray-800 rounded-xl shadow-2xl p-6 w-full max-w-lg border border-gray-700" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">{title}</h2>
                <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={24} /></button>
            </div>
            {children}
        </div>
    </div>
);

// --- Feature Components ---

const Overview = ({ expenses }) => {
  const { byCategory, totalExpenses, totalTransactions, averageExpense } = useMemo(() => {
    const categoryMap = {};
    expenses.forEach(exp => {
      categoryMap[exp.category] = (categoryMap[exp.category] || 0) + exp.amount;
    });
    const total = expenses.reduce((acc, exp) => acc + exp.amount, 0);
    const count = expenses.length;
    return {
      byCategory: Object.entries(categoryMap).map(([name, value]) => ({ name, value })),
      totalExpenses: total, totalTransactions: count, averageExpense: count > 0 ? total / count : 0,
    };
  }, [expenses]);

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF6666', '#66CCCC'];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
        <Card><h3 className="text-gray-400 text-lg">Total Expenses</h3><p className="text-3xl font-bold text-green-400">{formatINR(totalExpenses)}</p></Card>
        <Card><h3 className="text-gray-400 text-lg">Total Transactions</h3><p className="text-3xl font-bold text-white">{totalTransactions}</p></Card>
        <Card><h3 className="text-gray-400 text-lg">Average Expense</h3><p className="text-3xl font-bold text-green-400">{formatINR(averageExpense)}</p></Card>
      </div>
      <Card>
        <h2 className="text-xl font-bold mb-4">Category Distribution</h2>
        {expenses.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart><Pie data={byCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={120} fill="#8884d8" label>{byCategory.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip formatter={(value) => formatINR(value)} /><Legend /></PieChart>
          </ResponsiveContainer>
        ) : <p className="text-center text-gray-500">No expense data to display charts.</p>}
      </Card>
    </div>
  );
};

const ExpenseForm = ({ expense, onSubmit, onCancel, loading }) => {
    const [formData, setFormData] = useState({
        amount: expense?.amount || '',
        category: expense?.category || '',
        description: expense?.description || '',
        date: expense?.date || new Date().toISOString().split('T')[0],
    });

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({ ...formData, amount: parseFloat(formData.amount) });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div><label className="block text-sm font-medium text-gray-300 mb-2">Amount (₹)</label><input type="number" name="amount" value={formData.amount} onChange={handleChange} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500" required step="0.01" /></div>
            <div><label className="block text-sm font-medium text-gray-300 mb-2">Category</label><select name="category" value={formData.category} onChange={handleChange} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500" required><option value="">Select a category</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
            <div><label className="block text-sm font-medium text-gray-300 mb-2">Description</label><input type="text" name="description" value={formData.description} onChange={handleChange} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500" /></div>
            <div><label className="block text-sm font-medium text-gray-300 mb-2">Date</label><input type="date" name="date" value={formData.date} onChange={handleChange} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500" required /></div>
            <div className="flex justify-end space-x-4 pt-2">
                <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg">Cancel</button>
                <button type="submit" disabled={loading} className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg disabled:bg-gray-500">{loading ? 'Saving...' : 'Save Expense'}</button>
            </div>
        </form>
    );
};

const AllExpenses = ({ expenses, token, onAction }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingExpense, setEditingExpense] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleEdit = (expense) => { setEditingExpense(expense); setIsModalOpen(true); };
    const handleCloseModal = () => { setIsModalOpen(false); setEditingExpense(null); };

    const handleSaveExpense = async (formData) => {
        setLoading(true); setError('');
        const endpoint = editingExpense ? `/edit-expense/${editingExpense.id}` : '/add-expense';
        const method = editingExpense ? 'PUT' : 'POST';
        try {
            await apiFetch(endpoint, { method, body: formData, token });
            onAction(); handleCloseModal();
        } catch (err) { setError(err.message); } 
        finally { setLoading(false); }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this expense?')) {
            try { await apiFetch(`/delete-expense/${id}`, { method: 'DELETE', token }); onAction(); } 
            catch (err) { alert(`Error: ${err.message}`); }
        }
    };
    
    const handleFlag = async (id, flag) => {
        try { await apiFetch('/flag-expense', { method: 'POST', body: { id, flag }, token }); onAction(); }
        catch (err) { alert(`Error: ${err.message}`); }
    };

    return (
        <Card>
            <h2 className="text-2xl font-bold mb-4">All Expenses</h2>
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead><tr className="border-b border-gray-600"><th className="p-3">Date</th><th className="p-3">Amount</th><th className="p-3">Category</th><th className="p-3">Description</th><th className="p-3">Flag</th><th className="p-3">Actions</th></tr></thead>
                    <tbody>
                        {expenses.map(exp => (
                            <tr key={exp.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                                <td className="p-3">{new Date(exp.date).toLocaleDateString('en-IN')}</td>
                                <td className="p-3 font-semibold">{formatINR(exp.amount)}</td><td className="p-3">{exp.category}</td><td className="p-3 text-gray-400">{exp.description}</td>
                                <td className="p-3"><div className="flex space-x-2">{exp.flag === 'green' ? <ThumbsUp size={20} className="text-green-500" /> : <button onClick={() => handleFlag(exp.id, 'green')} className="text-gray-500 hover:text-green-500"><ThumbsUp size={20} /></button>}{exp.flag === 'red' ? <ThumbsDown size={20} className="text-red-500" /> : <button onClick={() => handleFlag(exp.id, 'red')} className="text-gray-500 hover:text-red-500"><ThumbsDown size={20} /></button>}</div></td>
                                <td className="p-3"><div className="flex space-x-3"><button onClick={() => handleEdit(exp)} className="text-blue-400 hover:text-blue-300"><Edit size={20} /></button><button onClick={() => handleDelete(exp.id)} className="text-red-400 hover:text-red-300"><Trash2 size={20} /></button></div></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={editingExpense ? "Edit Expense" : "Add Expense"}>
                <ErrorDisplay message={error} onClear={() => setError('')} />
                <ExpenseForm expense={editingExpense} onSubmit={handleSaveExpense} onCancel={handleCloseModal} loading={loading} />
            </Modal>
        </Card>
    );
};

const AIAnalysis = ({ token }) => {
    const [analysis, setAnalysis] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleAnalyze = async () => {
        setLoading(true); setError(''); setAnalysis('');
        try { const data = await apiFetch('/analyze', { method: 'POST', token }); setAnalysis(data.analysis); } 
        catch (err) { setError(err.message); }
        finally { setLoading(false); }
    };

    return (
        <Card className="text-center">
            <BrainCircuit size={48} className="mx-auto text-green-400 mb-4" />
            <h2 className="text-2xl font-bold mb-2">AI Expense Analysis</h2>
            <p className="text-gray-400 mb-6">Get personalized insights and tips on your spending habits.</p>
            <button onClick={handleAnalyze} disabled={loading} className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition-colors disabled:bg-gray-500">{loading ? 'Analyzing...' : 'Analyze My Expenses'}</button>
            <ErrorDisplay message={error} onClear={() => setError('')} />
            {loading && <LoadingSpinner />}
            {analysis && <div className="mt-6 p-4 bg-gray-700/50 rounded-lg text-left whitespace-pre-wrap">{analysis}</div>}
        </Card>
    );
};

const AIChat = ({ token }) => {
    const [messages, setMessages] = useState([{ sender: 'ai', text: "Hi! I'm your AI financial assistant. Ask me anything about your expenses." }]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const chatEndRef = useRef(null);

    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const handleSend = async () => {
        if (!input.trim()) return;
        const newMessages = [...messages, { sender: 'user', text: input }];
        setMessages(newMessages); setInput(''); setLoading(true);

        try {
            const data = await apiFetch('/chat', { method: 'POST', body: { query: input }, token });
            setMessages([...newMessages, { sender: 'ai', text: data.response }]);
        } catch (err) {
            setMessages([...newMessages, { sender: 'ai', text: `Sorry, I ran into an error: ${err.message}` }]);
        } finally { setLoading(false); }
    };

    return (
        <Card className="flex flex-col h-[70vh]">
            <h2 className="text-2xl font-bold mb-4">Chat with Brokebot</h2>
            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                {messages.map((msg, index) => (
                    <div key={index} className={`flex ${msg.sender === 'ai' ? 'justify-start' : 'justify-end'}`}>
                        <div className={`max-w-lg p-3 rounded-lg ${msg.sender === 'ai' ? 'bg-gray-700' : 'bg-green-600'}`}>{msg.text}</div>
                    </div>
                ))}
                {loading && <div className="flex justify-start"><div className="p-3 rounded-lg bg-gray-700">...</div></div>}
                <div ref={chatEndRef} />
            </div>
            <div className="mt-4 flex space-x-2">
                <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSend()} className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="Ask about your spending..." />
                <button onClick={handleSend} disabled={loading} className="bg-green-600 hover:bg-green-700 text-white p-3 rounded-lg disabled:bg-gray-500"><Send size={20} /></button>
            </div>
        </Card>
    );
};

// --- Authentication Component ---
const AuthPage = ({ onLoginSuccess }) => {
    const [isLoginView, setIsLoginView] = useState(true);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [loading, setLoading] = useState(false);

    const clearMessages = () => { setError(''); setSuccessMessage(''); };
    const switchView = (isLogin) => { setIsLoginView(isLogin); clearMessages(); };

    const handleLogin = async (e) => {
        e.preventDefault(); setLoading(true); clearMessages();
        try {
            const formData = new URLSearchParams(); formData.append('username', username); formData.append('password', password);
            const response = await fetch(`${API_BASE_URL}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: formData });
            if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.detail || 'Login failed.'); }
            const data = await response.json(); onLoginSuccess(data.access_token);
        } catch (err) { setError(err instanceof TypeError ? 'Could not connect to the server. Please ensure the backend is running.' : err.message); } 
        finally { setLoading(false); }
    };

    const handleRegister = async (e) => {
        e.preventDefault(); setLoading(true); clearMessages();
        try {
            await apiFetch('/register', { method: 'POST', body: { username, password } });
            setSuccessMessage('Registration successful! Please log in.'); setIsLoginView(true); setPassword('');
        } catch (err) { setError(err.message); } 
        finally { setLoading(false); }
    };

    return (
        <div className="min-h-screen bg-gray-900 flex flex-col justify-center items-center p-4">
            <div className="w-full max-w-md">
                <div className="flex items-center space-x-3 mb-8 justify-center"><Wallet size={48} className="text-green-400" /><div><h1 className="text-4xl font-bold text-white">Brokemate</h1><p className="text-lg text-gray-400">Your Personal Expense Manager</p></div></div>
                <Card>
                    <div className="flex border-b border-gray-700 mb-6"><button onClick={() => switchView(true)} className={`flex-1 py-3 text-lg font-semibold ${isLoginView ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-500'}`}>Login</button><button onClick={() => switchView(false)} className={`flex-1 py-3 text-lg font-semibold ${!isLoginView ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-500'}`}>Register</button></div>
                    <ErrorDisplay message={error} onClear={clearMessages} />
                    {successMessage && <div className="bg-green-500/20 border border-green-500 text-green-300 px-4 py-3 rounded-lg my-4">{successMessage}</div>}
                    <form onSubmit={isLoginView ? handleLogin : handleRegister} className="space-y-6">
                        <div><label className="block text-sm font-medium text-gray-300 mb-2">Email (Username)</label><input type="email" value={username} onChange={e => setUsername(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500" required /></div>
                        <div><label className="block text-sm font-medium text-gray-300 mb-2">Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500" required /></div>
                        <button type="submit" disabled={loading} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:bg-gray-500">{loading ? 'Processing...' : (isLoginView ? 'Login' : 'Register')}</button>
                    </form>
                </Card>
            </div>
        </div>
    );
};


// --- Main App Component ---
function App() {
  const [token, setToken] = useState(() => localStorage.getItem('brokemate_token'));
  const [expenses, setExpenses] = useState([]);
  const [activeView, setActiveView] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const handleLoginSuccess = (newToken) => { localStorage.setItem('brokemate_token', newToken); setToken(newToken); };
  const handleLogout = () => { localStorage.removeItem('brokemate_token'); setToken(null); setExpenses([]); };

  const fetchExpenses = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true); setError('');
    try { const data = await apiFetch('/expenses', { token }); setExpenses(data || []); } 
    catch (err) { setError(err.message); if (err.message.includes('Could not validate credentials')) handleLogout(); } 
    finally { setLoading(false); }
  }, [token]);
  
  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  const handleAddExpense = async (formData) => {
    setLoading(true); setError('');
    try { await apiFetch('/add-expense', { method: 'POST', body: formData, token }); fetchExpenses(); setIsAddModalOpen(false); } 
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  if (!token) return <AuthPage onLoginSuccess={handleLoginSuccess} />;

  const TABS = [
    { id: 'overview', label: 'Overview', icon: Wallet, component: <Overview expenses={expenses} /> },
    { id: 'all', label: 'All Expenses', icon: LayoutList, component: <AllExpenses expenses={expenses} token={token} onAction={fetchExpenses} /> },
    { id: 'analysis', label: 'AI Analysis', icon: BrainCircuit, component: <AIAnalysis token={token} /> },
    { id: 'chat', label: 'AI Chat', icon: MessageSquare, component: <AIChat token={token} /> },
  ];

  const activeComponent = TABS.find(tab => tab.id === activeView)?.component;

  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans">
      <Header onLogout={handleLogout} />
      <main className="p-4 md:p-8 max-w-7xl mx-auto">
        <div className="bg-gray-800 p-2 rounded-xl flex items-center space-x-2 mb-8 shadow-inner">
          <div className="flex-1 flex space-x-2">
            {TABS.map(tab => <TabButton key={tab.id} icon={tab.icon} label={tab.label} isActive={activeView === tab.id} onClick={() => setActiveView(tab.id)} />)}
          </div>
          <button onClick={() => setIsAddModalOpen(true)} className="flex items-center space-x-2 py-3 px-4 text-sm font-medium rounded-lg transition-all duration-200 bg-green-500 text-white shadow-lg hover:bg-green-600"><PlusCircle size={18} /><span>Add Expense</span></button>
        </div>
        <ErrorDisplay message={error} onClear={() => setError('')} />
        {loading && activeView !== 'all' ? <LoadingSpinner /> : activeComponent}
      </main>
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add New Expense">
        <ExpenseForm onSubmit={handleAddExpense} onCancel={() => setIsAddModalOpen(false)} loading={loading} />
      </Modal>
    </div>
  );
}

export default App;

