/* Search, Tracing, and DB Query Exploration Component */
window.TracingComponent = {
  // Search in nodes table using Alpine query
  searchNodes() {
    if (!this.searchTerm || this.searchTerm.trim().length < 2) {
      this.searchResults = [];
      return;
    }
    
    let sql = `
      SELECT id, name, qualified_name, kind, language, file_path 
      FROM nodes 
      WHERE (name LIKE ? OR qualified_name LIKE ?)
    `;
    const params = [`%${this.searchTerm}%`, `%${this.searchTerm}%`];
    
    if (this.selectedLanguages.length > 0) {
      const placeholders = this.selectedLanguages.map(() => "?").join(",");
      sql += ` AND language IN (${placeholders})`;
      params.push(...this.selectedLanguages);
    }
    
    if (this.selectedNodeKinds.length > 0) {
      const placeholders = this.selectedNodeKinds.map(() => "?").join(",");
      sql += ` AND kind IN (${placeholders})`;
      params.push(...this.selectedNodeKinds);
    }
    
    sql += " ORDER BY length(name) ASC LIMIT 25";
    
    try {
      this.searchResults = this.queryToObjects(sql, params);
    } catch (err) {
      console.error(err);
    }
  },

  closeAutocomplete() {
    this.searchResults = [];
  },

  // Seed search result into visualizer and expand it
  addSeedNode(node) {
    this.searchTerm = '';
    this.searchResults = [];
    this.addNodeToCanvas(node);
    this.expandNodeNeighbors(node.id);
    this.showNodeDetails(node.id);
    
    setTimeout(() => {
      this.focusOnNode(node.id);
    }, 300);
  },

  // Load most connected nodes using optimized Union SQL
  loadCentralNodes() {
    this.clearGraph();
    try {
      const sqlDegrees = `
        SELECT node_id, COUNT(*) as degree FROM (
          SELECT source as node_id FROM edges
          UNION ALL
          SELECT target as node_id FROM edges
        ) GROUP BY node_id ORDER BY degree DESC LIMIT 15
      `;
      const degrees = this.queryToObjects(sqlDegrees);
      
      if (degrees.length === 0) {
        const fallbackNodes = this.queryToObjects("SELECT id, name, kind, language, qualified_name, file_path FROM nodes LIMIT 15");
        fallbackNodes.forEach(n => this.addNodeToCanvas(n));
      } else {
        const idsList = degrees.map(d => `'${d.node_id.replace(/'/g, "''")}'`).join(",");
        const centralNodes = this.queryToObjects(`SELECT id, name, kind, language, qualified_name, file_path FROM nodes WHERE id IN (${idsList})`);
        
        centralNodes.forEach(n => {
          this.addNodeToCanvas(n);
        });
        
        const connections = this.queryToObjects(`
          SELECT source, target, kind FROM edges 
          WHERE source IN (${idsList}) AND target IN (${idsList})
        `);
        
        connections.forEach(c => {
          this.addEdgeToCanvas({
            source: c.source,
            target: c.target,
            kind: c.kind
          });
        });
      }
      
      this.updateStats();
      this.updateGraphVisibilities();
      
      setTimeout(() => {
        if (this.network) {
          this.network.fit();
        }
      }, 300);
    } catch (err) {
      console.error('Error loading central nodes:', err);
    }
  },

  // Fetch schema and connections for details sidebar
  showNodeDetails(nodeId) {
    this.mobileSidebarOpen = false;
    try {
      const rows = this.queryToObjects("SELECT * FROM nodes WHERE id = ?", [nodeId]);
      if (rows.length === 0) return;
      
      this.selectedNode = rows[0];
      
      const incoming = this.queryToObjects(`
        SELECT e.kind as edge_kind, n.id as node_id, n.name as node_name, n.kind as node_kind, n.language as node_lang
        FROM edges e
        JOIN nodes n ON e.source = n.id
        WHERE e.target = ?
        LIMIT 50
      `, [nodeId]);
      
      const outgoing = this.queryToObjects(`
        SELECT e.kind as edge_kind, n.id as node_id, n.name as node_name, n.kind as node_kind, n.language as node_lang
        FROM edges e
        JOIN nodes n ON e.target = n.id
        WHERE e.source = ?
        LIMIT 50
      `, [nodeId]);
      
      this.selectedNodeNeighbors = { incoming, outgoing };
    } catch (err) {
      console.error('Error fetching details:', err);
    }
  },

  // DB expansion: Select all connected nodes and plot them
  expandNodeNeighbors(nodeId) {
    try {
      const sql = `
        SELECT e.source, e.target, e.kind,
               ns.name as source_name, ns.kind as source_kind, ns.language as source_lang, ns.qualified_name as source_qn, ns.file_path as source_path,
               nt.name as target_name, nt.kind as target_kind, nt.language as target_lang, nt.qualified_name as target_qn, nt.file_path as target_path
        FROM edges e
        JOIN nodes ns ON e.source = ns.id
        JOIN nodes nt ON e.target = nt.id
        WHERE e.source = ? OR e.target = ?
        LIMIT 80
      `;
      const connections = this.queryToObjects(sql, [nodeId, nodeId]);
      
      connections.forEach(c => {
        this.addNodeToCanvas({
          id: c.source,
          name: c.source_name,
          kind: c.source_kind,
          language: c.source_lang,
          qualified_name: c.source_qn,
          file_path: c.source_path
        });
        
        this.addNodeToCanvas({
          id: c.target,
          name: c.target_name,
          kind: c.target_kind,
          language: c.target_lang,
          qualified_name: c.target_qn,
          file_path: c.target_path
        });
        
        this.addEdgeToCanvas({
          source: c.source,
          target: c.target,
          kind: c.kind
        });
      });
      
      this.updateStats();
      this.updateGraphVisibilities();
    } catch (err) {
      console.error('Expansion failed:', err);
    }
  },

  // Fetch and load relations based on checked file extensions
  loadExtensionsRelations() {
    if (this.selectedExtensions.length === 0) {
      alert("Please check at least one file extension!");
      return;
    }
    
    let sql = `
      SELECT e.source, e.target, e.kind,
             ns.name as source_name, ns.kind as source_kind, ns.language as source_lang, ns.qualified_name as source_qn, ns.file_path as source_path,
             nt.name as target_name, nt.kind as target_kind, nt.language as target_lang, nt.qualified_name as target_qn, nt.file_path as target_path
      FROM edges e
      JOIN nodes ns ON e.source = ns.id
      JOIN nodes nt ON e.target = nt.id
      WHERE 1=1
    `;
    
    const extConditions = [];
    const params = [];
    this.selectedExtensions.forEach(ext => {
      extConditions.push("ns.file_path LIKE ? OR nt.file_path LIKE ?");
      params.push(`%${ext}`, `%${ext}`);
    });
    
    if (extConditions.length > 0) {
      sql += ` AND (${extConditions.join(" OR ")})`;
    }
    
    sql += " LIMIT 100";
    
    try {
      const relations = this.queryToObjects(sql, params);
      if (relations.length === 0) {
        alert("No connections found for the selected extensions.");
        return;
      }
      
      relations.forEach(rel => {
        this.addNodeToCanvas({
          id: rel.source,
          name: rel.source_name,
          kind: rel.source_kind,
          language: rel.source_lang,
          qualified_name: rel.source_qn,
          file_path: rel.source_path
        });
        
        this.addNodeToCanvas({
          id: rel.target,
          name: rel.target_name,
          kind: rel.target_kind,
          language: rel.target_lang,
          qualified_name: rel.target_qn,
          file_path: rel.target_path
        });
        
        this.addEdgeToCanvas({
          source: rel.source,
          target: rel.target,
          kind: rel.kind
        });
      });
      
      this.updateStats();
      this.updateGraphVisibilities();
      
      setTimeout(() => {
        if (this.network) this.network.fit();
      }, 300);
      
      alert(`Successfully loaded ${relations.length} relationships.`);
    } catch (err) {
      console.error("Extension relations query failed:", err);
      alert("Error running relations query. Check error details in console.");
    }
  },

  // Entry Point Request Tracing Logic (Loads execution path and links to controllers/workers)
  traceEntryPoint(entryNode) {
    this.clearGraph();
    const entryFile = entryNode.file_path;
    const entryId = entryNode.id;
    
    this.addNodeToCanvas(entryNode);
    
    let controllerPathPrefix = '';
    let secondaryPathPrefix = '';
    
    if (entryFile.includes('/')) {
      const parts = entryFile.split('/');
      const dir = parts[0];
      controllerPathPrefix = `app/controllers/${dir}/`;
    } else if (entryFile === 'cli.php') {
      controllerPathPrefix = 'app/workers/';
      secondaryPathPrefix = 'app/commands/';
    } else {
      const name = entryFile.split('.')[0];
      controllerPathPrefix = `app/controllers/${name}/`;
    }
    
    try {
      const sql = `
        SELECT id, name, qualified_name, kind, language, file_path 
        FROM nodes 
        WHERE kind = 'class' AND (file_path LIKE ?1 OR (?2 != '' AND file_path LIKE ?2))
      `;
      const controllers = this.queryToObjects(sql, [controllerPathPrefix + '%', secondaryPathPrefix ? secondaryPathPrefix + '%' : '']);
      
      if (controllers.length === 0) {
        this.expandNodeNeighbors(entryId);
        alert(`Loaded entry point ${entryFile} and expanded its direct file connections (no controllers found under ${controllerPathPrefix}).`);
        return;
      }
      
      controllers.forEach(ctrl => {
        this.addNodeToCanvas(ctrl);
        this.addEdgeToCanvas({
          source: entryId,
          target: ctrl.id,
          kind: 'routes_to'
        });
      });
      
      const ctrlIds = controllers.map(c => `'${c.id.replace(/'/g, "''")}'`).join(",");
      const sqlDeps = `
        SELECT e.source, e.target, e.kind,
               nt.name as target_name, nt.kind as target_kind, nt.language as target_lang, nt.qualified_name as target_qn, nt.file_path as target_path
        FROM edges e
        JOIN nodes nt ON e.target = nt.id
        WHERE e.source IN (${ctrlIds}) AND e.kind IN ('instantiates', 'calls', 'references', 'extends')
        LIMIT 60
      `;
      const dependencies = this.queryToObjects(sqlDeps);
      
      dependencies.forEach(dep => {
        this.addNodeToCanvas({
          id: dep.target,
          name: dep.target_name,
          kind: dep.target_kind,
          language: dep.target_lang,
          qualified_name: dep.target_qn,
          file_path: dep.target_path
        });
        
        this.addEdgeToCanvas({
          source: dep.source,
          target: dep.target,
          kind: dep.kind
        });
      });
      
      this.updateStats();
      this.updateGraphVisibilities();
      
      setTimeout(() => {
        if (this.network) {
          this.network.fit();
        }
      }, 350);
    } catch (err) {
      console.error("Entry point trace failed:", err);
      alert("Request tracing failed. Check browser error details.");
    }
  },

  // Run raw SQL queries in Console
  executeCustomSql(shouldPlotGraph = false) {
    this.sqlError = null;
    this.sqlResults = null;
    this.sqlColumns = [];
    
    if (!this.db) {
      this.sqlError = 'Database not loaded!';
      return;
    }
    
    try {
      const result = this.db.exec(this.sqlQuery);
      if (result.length === 0) {
        this.sqlResults = [];
        alert('Query executed successfully, but returned 0 rows.');
        return;
      }
      
      const columns = result[0].columns;
      const values = result[0].values;
      
      const rowObjects = values.map(row => {
        const obj = {};
        columns.forEach((col, idx) => {
          obj[col] = row[idx];
        });
        return obj;
      });
      
      this.sqlColumns = columns;
      this.sqlResults = rowObjects;
      
      if (shouldPlotGraph) {
        const hasSource = columns.includes('source');
        const hasTarget = columns.includes('target');
        
        if (!hasSource || !hasTarget) {
          this.sqlError = 'Error plotting graph: Query results must return columns named exactly "source" and "target" to establish relationships.';
          return;
        }
        
        const plotLines = rowObjects.filter(r => r.source && r.target);
        
        if (plotLines.length === 0) {
          alert('No valid rows containing source & target IDs found to plot.');
          return;
        }
        
        const nodeIds = new Set();
        plotLines.forEach(l => {
          nodeIds.add(l.source);
          nodeIds.add(l.target);
        });
        
        const uniqueNodeIds = Array.from(nodeIds);
        const chunkSize = 150;
        for (let i = 0; i < uniqueNodeIds.length; i += chunkSize) {
          const chunk = uniqueNodeIds.slice(i, i + chunkSize);
          const escapedIds = chunk.map(id => `'${id.toString().replace(/'/g, "''")}'`).join(",");
          const details = this.queryToObjects(`SELECT id, name, qualified_name, kind, language, file_path FROM nodes WHERE id IN (${escapedIds})`);
          
          details.forEach(n => this.addNodeToCanvas(n));
        }
        
        plotLines.forEach(line => {
          this.addEdgeToCanvas({
            source: line.source,
            target: line.target,
            kind: line.kind || 'custom'
          });
        });
        
        this.updateStats();
        this.updateGraphVisibilities();
        
        setTimeout(() => {
          if (this.network) this.network.fit();
        }, 400);
        
        alert(`Plotted ${plotLines.length} relationships on the map!`);
      }
    } catch (err) {
      console.error(err);
      this.sqlError = err.message || err.toString();
    }
  }
};
