/* Main Application Entry Point */
function graphApp() {
  return {
    // Shared Alpine.js state properties
    SQL: null,
    db: null,
    dbLoaded: false,
    dbName: '',
    dbSize: 0,
    loading: false,
    loadingStatus: '',
    activeTab: 'explorer', // explorer, sql, settings
    mobileSidebarOpen: false,
    
    // Filter options
    languages: [],
    selectedLanguages: [],
    nodeKinds: [],
    selectedNodeKinds: [],
    edgeKinds: [],
    selectedEdgeKinds: [],
    activeEdgeKinds: [],
    fileExtensions: [],
    selectedExtensions: [],
    entryPoints: [],
    
    // Search states
    searchTerm: '',
    searchResults: [],
    
    // Details sidebar states
    selectedNode: null,
    selectedNodeNeighbors: { incoming: [], outgoing: [] },
    
    // SQL Console states
    sqlQuery: 'SELECT source, target, kind FROM edges LIMIT 50',
    sqlError: null,
    sqlResults: null,
    sqlColumns: [],
    
    // Network visualization states
    network: null,
    nodesDataSet: null,
    edgesDataSet: null,
    nodesCount: 0,
    edgesCount: 0,
    physicsEnabled: true,
    hideIsolated: false,
    
    // Merge modular components
    ...window.DbComponent,
    ...window.NetworkComponent,
    ...window.TracingComponent,
    
    // Core Application Lifecycle Initialization
    async initApp() {
      this.loading = true;
      this.loadingStatus = 'Initializing SQLite WebAssembly engine...';
      try {
        const config = {
          locateFile: filename => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${filename}`
        };
        this.SQL = await initSqlJs(config);
        this.loading = false;
      } catch (err) {
        console.error('WASM Init Failed:', err);
        this.loadingStatus = 'Failed to load SQLite WebAssembly engine. Please reload.';
      }
      
      // Setup delete node handler
      window.addEventListener('keydown', (e) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedNode) {
          if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
            this.removeNodeFromCanvas(this.selectedNode.id);
          }
        }
      });
    },

    // Helper formatting
    formatBytes(bytes, decimals = 2) {
      if (!+bytes) return '0 Bytes';
      const k = 1024;
      const dm = decimals < 0 ? 0 : decimals;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    }
  };
}
