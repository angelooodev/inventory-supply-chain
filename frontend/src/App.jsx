function App() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background text-textmain font-mono">
      <div className="bg-surface p-8 rounded-lg shadow-2xl max-w-2xl w-full border-l-4 border-primary">
        
        <div className="flex justify-between items-center mb-6 border-b border-gray-600 pb-4">
          {/* FIXED: Replaced the > with &gt; so React doesn't crash */}
          <h1 className="text-2xl font-bold text-primary tracking-wider">
            &gt; SYS_ADMIN // GROUP_03
          </h1>
          <span className="text-sm bg-background px-3 py-1 rounded text-primary border border-primary/30 shadow-[0_0_10px_rgba(242,196,206,0.1)]">
            SYS: ONLINE
          </span>
        </div>

        <div className="space-y-4">
          <p className="text-lg">
            Welcome to the Inventory & Supply Chain Interface.
          </p>
          <p className="text-sm text-gray-400">
            Awaiting database connection parameters...
          </p>

          <div className="flex gap-4 pt-6">
            <button className="bg-primary text-background font-bold py-2 px-6 rounded hover:bg-white transition shadow-[0_0_15px_rgba(242,196,206,0.3)]">
              INITIALIZE_DATA
            </button>
            <button className="border border-textmain text-textmain font-bold py-2 px-6 rounded hover:border-primary hover:text-primary transition">
              VIEW_LOGS
            </button>
          </div>
        </div>
        
      </div>
    </div>
  )
}

export default App