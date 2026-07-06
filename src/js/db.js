/* SQLite Database Operations Component */
window.DbComponent = {
  // Helper to query and map results into standard Javascript object list
  queryToObjects(sql, params = []) {
    if (!this.db) return [];
    try {
      const res = this.db.exec(sql, params);
      if (res.length === 0) return [];
      
      const columns = res[0].columns;
      const values = res[0].values;
      return values.map(row => {
        const obj = {};
        columns.forEach((col, idx) => {
          obj[col] = row[idx];
        });
        return obj;
      });
    } catch (err) {
      throw err;
    }
  },

  // Handle uploaded/dropped SQLite file
  async handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
      await this.loadDatabaseFile(file);
    }
  },

  async handleFileDrop(e) {
    const file = e.dataTransfer.files[0];
    if (file) {
      await this.loadDatabaseFile(file);
    }
  },



  async loadDatabaseFile(file) {
    this.loading = true;
    this.loadingStatus = `Reading ${file.name} (${this.formatBytes(file.size)})...`;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        this.loadingStatus = 'Parsing SQLite database buffer...';
        const buffer = e.target.result;
        this.db = new this.SQL.Database(new Uint8Array(buffer));
        this.dbName = file.name;
        this.dbSize = file.size;
        this.onDatabaseLoaded();
      } catch (err) {
        console.error(err);
        alert('Error parsing database. Is it a valid SQLite file?');
        this.loading = false;
      }
    };
    reader.onerror = () => {
      alert('Failed to read file.');
      this.loading = false;
    };
    reader.readAsArrayBuffer(file);
  },

  async loadLocalDatabase() {
    this.loading = true;
    this.loadingStatus = 'Downloading local database from server...';
    try {
      const response = await fetch('db/codegraph.db');
      if (!response.ok) {
        throw new Error(`Database file not found on server at db/codegraph.db`);
      }
      this.loadingStatus = 'Parsing SQLite database buffer...';
      const buffer = await response.arrayBuffer();
      this.db = new this.SQL.Database(new Uint8Array(buffer));
      this.dbName = 'codegraph.db';
      this.dbSize = buffer.byteLength;
      this.onDatabaseLoaded();
    } catch (err) {
      console.error(err);
      alert('Error loading local database: ' + err.message);
      this.loading = false;
    }
  },

  onDatabaseLoaded() {
    this.dbLoaded = true;
    this.loading = false;
    
    // Populate filter checklist schemas dynamically
    try {
      const langs = this.queryToObjects("SELECT DISTINCT language FROM nodes WHERE language IS NOT NULL AND language != ''");
      this.languages = langs.map(l => l.language).sort();
      this.selectedLanguages = [...this.languages];

      const kinds = this.queryToObjects("SELECT DISTINCT kind FROM nodes WHERE kind IS NOT NULL AND kind != ''");
      this.nodeKinds = kinds.map(k => k.kind).sort();
      this.selectedNodeKinds = [...this.nodeKinds];

      const eKinds = this.queryToObjects("SELECT DISTINCT kind FROM edges WHERE kind IS NOT NULL AND kind != ''");
      this.edgeKinds = eKinds.map(ek => ek.kind).sort();
      this.selectedEdgeKinds = [...this.edgeKinds];
      this.activeEdgeKinds = [...this.edgeKinds];
      
      // Extract file extensions dynamically from files
      const paths = this.queryToObjects("SELECT path FROM files WHERE path IS NOT NULL");
      const exts = new Set();
      paths.forEach(p => {
        const ext = p.path.split('.').pop().toLowerCase();
        if (ext && ext !== 'db' && ext !== 'sqlite') {
          exts.add('.' + ext);
        }
      });
      this.fileExtensions = Array.from(exts).sort();
      this.selectedExtensions = [...this.fileExtensions];
      
      // Extract entry point files dynamically
      const sqlEntryPoints = `
        SELECT id, name, file_path 
        FROM nodes 
        WHERE kind = 'file' 
          AND (file_path = 'index.php' OR file_path LIKE '%/index.php' OR file_path = 'cli.php' OR file_path LIKE '%/cli.php' OR file_path = 'api.php' OR file_path LIKE '%/api.php')
          AND file_path NOT LIKE 'app/%'
          AND file_path NOT LIKE 'migrations/%'
          AND file_path NOT LIKE 'vendor/%'
      `;
      this.entryPoints = this.queryToObjects(sqlEntryPoints);
    } catch (err) {
      console.error('Error populating filters:', err);
    }

    // Initialize Vis.js network containers
    this.$nextTick(() => {
      this.initNetwork();
      this.loadCentralNodes();
    });
  },

  unloadDb() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    if (this.network) {
      this.network.destroy();
      this.network = null;
    }
    if (this.nodesDataSet) this.nodesDataSet = null;
    if (this.edgesDataSet) this.edgesDataSet = null;
    
    this.dbLoaded = false;
    this.selectedNode = null;
    this.searchTerm = '';
    this.searchResults = [];
    this.sqlResults = null;
    this.sqlError = null;
  }
};
