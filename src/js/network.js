/* Vis.js Graph Rendering and Layout Component */
window.NetworkComponent = {
  // Setup Vis.js Network
  initNetwork() {
    const container = document.getElementById('graph-viewport');
    if (!container) {
      console.error('Viewport element #graph-viewport not found in DOM during initNetwork!');
      return;
    }

    if (this.network) {
      try {
        this.network.destroy();
      } catch (err) {
        console.warn('Error destroying old network instance:', err);
      }
      this.network = null;
    }

    this.nodesDataSet = new vis.DataSet([]);
    this.edgesDataSet = new vis.DataSet([]);
    
    const data = {
      nodes: this.nodesDataSet,
      edges: this.edgesDataSet
    };
    
    const options = {
      nodes: {
        shape: 'dot',
        size: 16,
        font: {
          color: '#f8fafc',
          size: 12,
          face: 'Outfit, sans-serif'
        },
        borderWidth: 2,
        shadow: {
          enabled: true,
          color: 'rgba(0,0,0,0.4)',
          size: 6,
          x: 0,
          y: 3
        }
      },
      edges: {
        arrows: {
          to: { enabled: true, scaleFactor: 0.8 }
        },
        font: {
          size: 9,
          color: '#94a3b8',
          face: 'Outfit, sans-serif',
          align: 'middle',
          strokeWidth: 0
        },
        color: {
          color: '#334155',
          highlight: '#6366f1',
          hover: '#475569'
        },
        width: 1.5,
        smooth: {
          type: 'continuous',
          roundness: 0.4
        }
      },
      physics: {
        enabled: this.physicsEnabled,
        stabilization: {
          enabled: true,
          iterations: 180,
          fit: true
        },
        barnesHut: {
          gravitationalConstant: -6000,
          centralGravity: 0.1,
          springLength: 220,
          springConstant: 0.02,
          damping: 0.09
        }
      },
      interaction: {
        hover: true,
        keyboard: false,
        navigationButtons: false,
        tooltipDelay: 100,
        zoomSpeed: 0.5
      }
    };

    this.network = new vis.Network(container, data, options);

    // Tap events
    this.network.on('click', (params) => {
      if (params.nodes.length > 0) {
        const selectedId = params.nodes[0];
        this.showNodeDetails(selectedId);
      }
    });

    // Double tap to expand neighbors
    this.network.on('doubleClick', (params) => {
      if (params.nodes.length > 0) {
        const doubleClickedId = params.nodes[0];
        this.expandNodeNeighbors(doubleClickedId);
      }
    });

    // Zoom limit boundaries for mouse wheel & trackpad pinching
    let isMoving = false;
    let lastPosition = null;
    
    this.network.on('zoom', () => {
      if (isMoving) return;
      
      const minScale = 0.25; // Limit how far user can zoom out (from 0.08)
      const maxScale = 2.5;  // Limit how close user can zoom in
      const currentScale = this.network.getScale();
      
      if (currentScale < minScale || currentScale > maxScale) {
        isMoving = true;
        this.network.moveTo({ 
          position: lastPosition || this.network.getViewPosition(),
          scale: currentScale < minScale ? minScale : maxScale
        });
        isMoving = false;
      } else {
        lastPosition = this.network.getViewPosition();
      }
    });

    this.network.on('dragEnd', () => {
      lastPosition = this.network.getViewPosition();
    });
    
    this.updateStats();
    
    // Force layout fit after short interval once browser layout settles
    setTimeout(() => {
      if (this.network) {
        this.network.setSize('100%', '100%');
        this.network.fit();
      }
    }, 200);
  },

  // Helper to add node to graph
  addNodeToCanvas(node) {
    if (this.nodesDataSet.get(node.id)) return; // exists
    
    const design = window.KIND_COLORS[node.kind] || window.KIND_COLORS['default'];
    this.nodesDataSet.add({
      id: node.id,
      label: node.name,
      title: `Name: ${node.name}\nQualified: ${node.qualified_name}\nKind: ${node.kind}\nLanguage: ${node.language}`,
      color: design,
      kind: node.kind,
      language: node.language,
      qualified_name: node.qualified_name,
      file_path: node.file_path || '',
      hidden: false
    });
  },

  // Helper to add edge to graph
  addEdgeToCanvas(edge) {
    if (!this.nodesDataSet || !this.nodesDataSet.get(edge.source) || !this.nodesDataSet.get(edge.target)) {
      return; // Skip edge if source or target node is missing from canvas
    }
    const edgeId = `${edge.source}-${edge.target}-${edge.kind}`;
    if (this.edgesDataSet.get(edgeId)) return; // exists
    
    this.edgesDataSet.add({
      id: edgeId,
      from: edge.source,
      to: edge.target,
      label: edge.kind,
      kind: edge.kind,
      hidden: false
    });
  },

  // Remove single node from visualization
  removeNodeFromCanvas(nodeId) {
    if (!this.nodesDataSet) return;
    this.nodesDataSet.remove(nodeId);
    
    const connectedEdgeIds = this.edgesDataSet.get({
      filter: (edge) => edge.from === nodeId || edge.to === nodeId
    }).map(e => e.id);
    
    this.edgesDataSet.remove(connectedEdgeIds);
    
    if (this.selectedNode && this.selectedNode.id === nodeId) {
      this.selectedNode = null;
    }
    
    this.updateStats();
    this.updateGraphVisibilities();
  },

  clearGraph() {
    if (this.nodesDataSet) this.nodesDataSet.clear();
    if (this.edgesDataSet) this.edgesDataSet.clear();
    this.selectedNode = null;
    this.updateStats();
  },

  // Zoom & navigation helpers
  zoomIn() {
    if (!this.network) return;
    const maxScale = 2.5;
    const scale = Math.min(this.network.getScale() * 1.3, maxScale);
    this.network.moveTo({ scale: scale });
  },

  zoomOut() {
    if (!this.network) return;
    const minScale = 0.25;
    const scale = Math.max(this.network.getScale() / 1.3, minScale);
    this.network.moveTo({ scale: scale });
  },

  zoomToFit() {
    if (this.network) this.network.fit({ animation: true });
  },

  focusOnNode(nodeId) {
    if (!this.nodesDataSet.get(nodeId)) {
      const rows = this.queryToObjects("SELECT id, name, qualified_name, kind, language, file_path FROM nodes WHERE id = ?", [nodeId]);
      if (rows.length > 0) {
        this.addNodeToCanvas(rows[0]);
        this.expandNodeNeighbors(nodeId);
      }
    }
    
    this.showNodeDetails(nodeId);
    
    if (this.network) {
      this.network.selectNodes([nodeId]);
      this.network.focus(nodeId, {
        scale: 1.0,
        animation: { duration: 500 }
      });
    }
  },

  togglePhysics() {
    if (this.network) {
      this.network.setOptions({
        physics: { enabled: this.physicsEnabled }
      });
    }
  },

  // Client side show/hide based on settings & filters
  updateGraphVisibilities() {
    if (!this.nodesDataSet || !this.edgesDataSet) return;

    const activeExts = new Set(this.selectedExtensions);
    const activeEdgeTypes = new Set(this.activeEdgeKinds);
    
    const activeNodeDegrees = {};
    
    // Filter edges
    const edgesUpdate = [];
    this.edgesDataSet.forEach(edge => {
      const sourceNode = this.nodesDataSet.get(edge.from);
      const targetNode = this.nodesDataSet.get(edge.to);
      
      let isVisible = activeEdgeTypes.has(edge.kind);
      
      if (sourceNode && targetNode) {
        const sourceExt = '.' + sourceNode.file_path.split('.').pop().toLowerCase();
        const targetExt = '.' + targetNode.file_path.split('.').pop().toLowerCase();
        
        if (!activeExts.has(sourceExt) || !activeExts.has(targetExt)) {
          isVisible = false;
        }
      }
      
      edgesUpdate.push({
        id: edge.id,
        hidden: !isVisible
      });
      
      if (isVisible) {
        activeNodeDegrees[edge.from] = (activeNodeDegrees[edge.from] || 0) + 1;
        activeNodeDegrees[edge.to] = (activeNodeDegrees[edge.to] || 0) + 1;
      }
    });
    this.edgesDataSet.update(edgesUpdate);

    // Filter nodes
    const nodesUpdate = [];
    this.nodesDataSet.forEach(node => {
      const ext = '.' + node.file_path.split('.').pop().toLowerCase();
      let isHidden = !activeExts.has(ext);
      
      if (!isHidden && this.hideIsolated && !activeNodeDegrees[node.id]) {
        isHidden = true;
      }
      
      nodesUpdate.push({
        id: node.id,
        hidden: isHidden
      });
    });
    this.nodesDataSet.update(nodesUpdate);
    this.updateStats();
  },

  // Update active canvas node/edge count
  updateStats() {
    if (!this.nodesDataSet || !this.edgesDataSet) return;
    this.nodesCount = this.nodesDataSet.get({ filter: n => !n.hidden }).length;
    this.edgesCount = this.edgesDataSet.get({ filter: e => !e.hidden }).length;
  }
};
