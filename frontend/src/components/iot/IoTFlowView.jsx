import { useState, useEffect, useRef } from "react";
import { API, api } from "@/lib/api";
import {
  Activity, Settings, Zap, Play, Square, Circle,
  ArrowRight, Plus, Save, Download, BarChart3,
  X, GripVertical
} from "lucide-react";

export const IoTFlowView = ({ onMenuClick }) => {
  const [flows, setFlows] = useState([]);
  const [currentFlow, setCurrentFlow] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [connections, setConnections] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [flowName, setFlowName] = useState("Default Flow");
  const [loading, setLoading] = useState(false);
  const [connectingFrom, setConnectingFrom] = useState(null);
  const canvasRef = useRef(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [draggingNode, setDraggingNode] = useState(null);

  const nodeTypes = [
    { type: "data_source", label: "Source de donnees", icon: Activity, color: "blue" },
    { type: "output", label: "Point de sortie", icon: Square, color: "green" },
    { type: "attribute", label: "Initialiser un Attribut", icon: Settings, color: "purple" },
    { type: "logic", label: "Logique", icon: Zap, color: "yellow" },
    { type: "device_action", label: "Device action", icon: Play, color: "orange" },
    { type: "webhook", label: "Webhook", icon: ArrowRight, color: "red" },
  ];

  useEffect(() => {
    fetchFlows();
    setNodes([
      { id: "input-1", type: "data_source", label: "Default Input", position: { x: 100, y: 150 } },
      { id: "output-1", type: "output", label: "Default Output", position: { x: 500, y: 150 } }
    ]);
    setConnections([{ id: "conn-1", source_id: "input-1", target_id: "output-1" }]);
  }, []);

  const fetchFlows = async () => {
    try {
      const response = await api.get(`${API}/flows`);
      if (response.data.success) setFlows(response.data.flows);
    } catch (error) { console.error("Error fetching flows:", error); }
  };

  const saveFlow = async () => {
    setLoading(true);
    try {
      const flowData = { name: flowName, nodes, connections };
      if (currentFlow) {
        await api.put(`${API}/flows/${currentFlow.id}`, flowData);
      } else {
        const response = await api.post(`${API}/flows`, flowData);
        setCurrentFlow(response.data.flow);
      }
      fetchFlows();
      alert("Flux enregistre avec succes!");
    } catch (error) { console.error("Error saving flow:", error); }
    setLoading(false);
  };

  const loadFlow = (flow) => {
    setCurrentFlow(flow);
    setFlowName(flow.name);
    setNodes(flow.nodes || []);
    setConnections(flow.connections || []);
  };

  const createNewFlow = () => {
    setCurrentFlow(null);
    setFlowName("Nouveau Flux");
    setNodes([
      { id: `input-${Date.now()}`, type: "data_source", label: "Default Input", position: { x: 100, y: 150 } },
      { id: `output-${Date.now()}`, type: "output", label: "Default Output", position: { x: 500, y: 150 } }
    ]);
    setConnections([]);
  };

  const addNodeAtPosition = (nodeType, x, y) => {
    const typeConfig = nodeTypes.find(t => t.type === nodeType);
    const newNode = {
      id: `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: nodeType,
      label: typeConfig?.label || "New Node",
      position: { x, y }
    };
    setNodes([...nodes, newNode]);
  };

  const deleteNode = (nodeId) => {
    setNodes(nodes.filter(n => n.id !== nodeId));
    setConnections(connections.filter(c => c.source_id !== nodeId && c.target_id !== nodeId));
    setSelectedNode(null);
  };

  const handleCanvasMouseDown = (e) => {
    if (e.target === canvasRef.current) { setSelectedNode(null); setConnectingFrom(null); }
  };

  const handleNodeMouseDown = (e, nodeId) => {
    e.stopPropagation();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setDragOffset({ x: e.clientX - rect.left - node.position.x, y: e.clientY - rect.top - node.position.y });
    setIsDragging(true);
    setDraggingNode(nodeId);
    setSelectedNode(nodeId);
  };

  const handleCanvasMouseMove = (e) => {
    if (!isDragging || !draggingNode) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width - 180, e.clientX - rect.left - dragOffset.x));
    const y = Math.max(0, Math.min(rect.height - 80, e.clientY - rect.top - dragOffset.y));
    setNodes(nodes.map(n => n.id === draggingNode ? { ...n, position: { x, y } } : n));
  };

  const handleCanvasMouseUp = () => { setIsDragging(false); setDraggingNode(null); };

  const handleConnectorClick = (nodeId, isOutput) => {
    if (isOutput) {
      setConnectingFrom(nodeId);
    } else if (connectingFrom && connectingFrom !== nodeId) {
      const exists = connections.some(c => c.source_id === connectingFrom && c.target_id === nodeId);
      if (!exists) {
        setConnections([...connections, { id: `conn-${Date.now()}`, source_id: connectingFrom, target_id: nodeId }]);
      }
      setConnectingFrom(null);
    }
  };

  const deleteConnection = (connId) => setConnections(connections.filter(c => c.id !== connId));

  const exportFlow = () => {
    const flowData = { name: flowName, nodes, connections };
    const blob = new Blob([JSON.stringify(flowData, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${flowName.replace(/\s+/g, '_')}.json`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const getNodeIcon = (type) => (nodeTypes.find(t => t.type === type)?.icon || Circle);

  const getNodeColor = (type) => {
    const colors = {
      data_source: "border-l-blue-500 bg-blue-50/50",
      output: "border-l-emerald-500 bg-emerald-50/50",
      attribute: "border-l-purple-500 bg-purple-50/50",
      logic: "border-l-amber-500 bg-amber-50/50",
      device_action: "border-l-orange-500 bg-orange-50/50",
      webhook: "border-l-red-500 bg-red-50/50"
    };
    return colors[type] || "border-l-gray-500 bg-gray-50";
  };

  return (
    <div className="h-full flex flex-col" data-testid="iot-flow-view">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">Flux</span>
          <select
            value={currentFlow?.id || ""}
            onChange={(e) => { const flow = flows.find(f => f.id === e.target.value); if (flow) loadFlow(flow); }}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-300"
          >
            <option value="">Default Flow</option>
            {flows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <input
            type="text" value={flowName} onChange={(e) => setFlowName(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-300"
            placeholder="Nom du flux"
          />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={createNewFlow} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#111] text-white rounded-lg hover:bg-gray-800 text-xs font-medium">
            <Plus size={14} /> Nouveau
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Node palette */}
        <div className="w-52 bg-white border-r border-gray-200 p-4 overflow-y-auto flex-shrink-0">
          <h4 className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-3">Noeuds</h4>
          <div className="space-y-1.5">
            {nodeTypes.map((nt) => (
              <div key={nt.type} draggable onDragStart={(e) => e.dataTransfer.setData('nodeType', nt.type)}
                className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-grab active:cursor-grabbing text-xs transition-colors">
                <GripVertical size={12} className="text-gray-300" />
                <nt.icon size={14} className="text-gray-500" />
                <span className="text-gray-700">{nt.label}</span>
              </div>
            ))}
          </div>

          <div className="mt-5 space-y-2">
            <button onClick={saveFlow} disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#111] text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 text-xs font-medium">
              <Save size={14} /> {loading ? "..." : "Enregistrer"}
            </button>
            <button onClick={exportFlow}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-xs">
              <Download size={14} /> Exporter
            </button>
          </div>

          {connectingFrom && (
            <div className="mt-3 p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-[10px] text-blue-700">
              Mode connexion. Cliquez sur l'entree d'un autre noeud.
              <button onClick={() => setConnectingFrom(null)} className="block mt-1 text-blue-600 hover:underline">Annuler</button>
            </div>
          )}
        </div>

        {/* Canvas */}
        <div
          ref={canvasRef}
          className="flex-1 bg-gray-50 relative overflow-hidden select-none"
          style={{ backgroundImage: 'radial-gradient(circle, #e5e7eb 1px, transparent 1px)', backgroundSize: '24px 24px' }}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const nodeType = e.dataTransfer.getData('nodeType');
            if (nodeType) {
              const rect = canvasRef.current.getBoundingClientRect();
              addNodeAtPosition(nodeType, Math.max(0, e.clientX - rect.left - 90), Math.max(0, e.clientY - rect.top - 40));
            }
          }}
        >
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#9ca3af" />
              </marker>
            </defs>
            {connections.map((conn) => {
              const source = nodes.find(n => n.id === conn.source_id);
              const target = nodes.find(n => n.id === conn.target_id);
              if (!source || !target) return null;
              const sx = source.position.x + 180, sy = source.position.y + 40;
              const tx = target.position.x, ty = target.position.y + 40;
              const mx = (sx + tx) / 2;
              return (
                <g key={conn.id} className="pointer-events-auto cursor-pointer" onClick={() => deleteConnection(conn.id)}>
                  <path d={`M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`}
                    stroke="#d1d5db" strokeWidth="2" fill="none" markerEnd="url(#arrowhead)" className="hover:stroke-red-500 transition-colors" />
                </g>
              );
            })}
          </svg>

          {nodes.map((node) => {
            const Icon = getNodeIcon(node.type);
            return (
              <div key={node.id}
                className={`absolute bg-white rounded-xl border-2 border-l-4 shadow-sm cursor-move select-none transition-shadow
                  ${getNodeColor(node.type)}
                  ${selectedNode === node.id ? 'ring-2 ring-gray-900 shadow-lg' : 'hover:shadow-md'}
                `}
                style={{ left: node.position.x, top: node.position.y, width: 180, minHeight: 70, zIndex: draggingNode === node.id ? 50 : 10 }}
                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                onClick={() => setSelectedNode(node.id)}
              >
                <div className={`absolute -left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2
                  ${connectingFrom ? 'bg-blue-500 border-blue-600 cursor-pointer animate-pulse' : 'bg-white border-gray-300'}
                  flex items-center justify-center hover:bg-blue-100 transition-colors`}
                  onClick={(e) => { e.stopPropagation(); handleConnectorClick(node.id, false); }}>
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                </div>

                <div className="p-3 flex items-center gap-2">
                  <div className="p-1.5 bg-white rounded-lg shadow-sm border border-gray-100">
                    <Icon size={14} className="text-gray-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <input type="text" value={node.label}
                      onChange={(e) => setNodes(nodes.map(n => n.id === node.id ? { ...n, label: e.target.value } : n))}
                      className="text-xs font-medium text-gray-800 bg-transparent border-none focus:outline-none w-full truncate"
                      onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} />
                    <div className="text-[10px] text-gray-400 capitalize">{node.type.replace('_', ' ')}</div>
                  </div>
                </div>

                <div className={`absolute -right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2
                  ${connectingFrom === node.id ? 'bg-blue-500 border-blue-600' : 'bg-white border-gray-300'}
                  flex items-center justify-center cursor-pointer hover:bg-emerald-100 transition-colors`}
                  onClick={(e) => { e.stopPropagation(); handleConnectorClick(node.id, true); }}>
                  <ArrowRight size={10} className="text-gray-400" />
                </div>

                {selectedNode === node.id && (
                  <button onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full hover:bg-red-600 flex items-center justify-center shadow-md">
                    <X size={12} />
                  </button>
                )}
              </div>
            );
          })}

          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <Zap size={40} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Glissez-deposez des noeuds ici</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
