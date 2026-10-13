import { useState, useEffect, useRef, useCallback } from "react";
import { GoogleGenAI } from "@google/genai";
import { 
  Bug, 
  Upload, 
  FileText, 
  History, 
  Zap, 
  Shield, 
  Activity, 
  Clock, 
  ChevronDown, 
  ChevronUp, 
  X, 
  Check, 
  AlertTriangle, 
  Cpu, 
  Brain, 
  Download, 
  Copy, 
  Search,
  ArrowRight,
  Database,
  Code,
  Terminal,
  Layers,
  BarChart3,
  RefreshCw,
  MoreHorizontal,
  Trash2,
  FileDown
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { RandomForestClassifier } from "./ml/RandomForest";

// Initialize Gemini
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const rf = new RandomForestClassifier();

// --- SAMPLE DATA ---
const sampleBugs = [
  {
    title: "Payment Gateway Timeout in Production",
    type: "network", component: "payment", affectedUsers: 8500,
    frequency: 45, environment: "production", workaround: "no",
    timeToReproduce: "immediate", stackDepth: 32, errorRateSpike: ">50%",
    description: "Payment API calls timing out after 30s, affecting checkout flow for all users in EU region"
  },
  {
    title: "Memory Leak in User Session Manager",
    type: "memory_leak", component: "auth", affectedUsers: 2000,
    frequency: 12, environment: "production", workaround: "partial",
    timeToReproduce: "sometimes", stackDepth: 18, errorRateSpike: "20-50%",
    description: "Server memory grows 2GB/hour due to session objects not being garbage collected"
  },
  {
    title: "SQL Injection Vulnerability in Search",
    type: "security", component: "database", affectedUsers: 10000,
    frequency: 5, environment: "production", workaround: "no",
    timeToReproduce: "immediate", stackDepth: 8, errorRateSpike: "<5%",
    description: "Unparameterized query in product search allows potential data exfiltration"
  },
  {
    title: "Button Misaligned on Mobile Safari",
    type: "ui", component: "frontend", affectedUsers: 150,
    frequency: 200, environment: "production", workaround: "yes",
    timeToReproduce: "immediate", stackDepth: 2, errorRateSpike: "<5%",
    description: "CTA button overlaps navigation bar on iOS Safari 16 in landscape mode"
  },
  {
    title: "Dashboard Load Time Exceeds 8 Seconds",
    type: "performance", component: "core", affectedUsers: 3200,
    frequency: 320, environment: "staging", workaround: "partial",
    timeToReproduce: "immediate", stackDepth: 12, errorRateSpike: "5-20%",
    description: "Main analytics dashboard makes 47 sequential API calls causing 8–12s load time"
  }
];

// --- MAIN COMPONENT ---
export default function BugSightDashboard() {
  const [activeTab, setActiveTab] = useState("manual"); // "manual" or "bulk"
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [history, setHistory] = useState([]);
  const [llmRecommendation, setLlmRecommendation] = useState<string | null>(null);
  const [batchRecommendation, setBatchRecommendation] = useState<string | null>(null);
  const [isLlmLoading, setIsLlmLoading] = useState(false);
  const [stats, setStats] = useState({ total: 0, critical: 0, avgResTime: "4.2h" });
  const [searchQuery, setSearchQuery] = useState("");
  const [isHistoryMenuOpen, setIsHistoryMenuOpen] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const historyMenuRef = useRef<HTMLDivElement>(null);

  // Bulk Upload State
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<{ headers: string[], rows: any[] }>({ headers: [], rows: [] });
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [mappingStep, setMappingStep] = useState("upload"); // upload, mapping, preview, processing, results
  const [batchResults, setBatchResults] = useState([]);
  const [processingProgress, setProcessingProgress] = useState(0);

  // Manual Form State
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    type: "logic",
    component: "core",
    affectedUsers: 500,
    frequency: 10,
    environment: "development",
    workaround: "yes",
    timeToReproduce: "sometimes",
    stackDepth: 5,
    errorRateSpike: "<5%"
  });

  // Refs for animations
  const treesRef = useRef([]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    const savedHistory = localStorage.getItem("bug_history");
    if (savedHistory) {
      const parsed = JSON.parse(savedHistory);
      setHistory(parsed);
      updateStats(parsed);
    }
    return () => clearInterval(timer);
  }, []);

  const formatDate = (dateStr: string | undefined | null) => {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? "Invalid Date" : date.toLocaleString();
  };

  const formatISO = (dateStr: string | undefined | null) => {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? "Invalid Date" : date.toISOString();
  };

  const updateStats = (data) => {
    const total = data.length;
    const critical = data.filter(b => b.prediction.label === "CRITICAL").length;
    setStats(prev => ({ ...prev, total, critical }));
  };

  const handleManualSubmit = async (e) => {
    e?.preventDefault();
    setIsAnalyzing(true);
    setPrediction(null);
    setLlmRecommendation(null);

    // Simulate analysis delay
    await new Promise(r => setTimeout(r, 1500));

    const result = rf.predict(formData);
    setPrediction(result);
    setIsAnalyzing(false);

    const newBug = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...formData,
      prediction: result,
      timestamp: new Date().toISOString(),
      source: "Manual"
    };

    const updatedHistory = [newBug, ...history].slice(0, 50);
    setHistory(updatedHistory);
    localStorage.setItem("bug_history", JSON.stringify(updatedHistory));
    updateStats(updatedHistory);

    // Trigger LLM
    fetchRecommendation(newBug);
  };

  const fetchBatchRecommendation = async (bugs: any[]) => {
    setIsLlmLoading(true);
    setLlmRecommendation(null);
    try {
      const criticalBugs = bugs.filter(b => b.prediction.label === "CRITICAL");
      const highBugs = bugs.filter(b => b.prediction.label === "HIGH");
      
      const prompt = `Provide a COMPREHENSIVE BATCH INTELLIGENCE REPORT for these ${bugs.length} bugs:
Total: ${bugs.length} | Critical: ${criticalBugs.length} | High: ${highBugs.length}

BUG LIST:
${bugs.map(b => `- ${b.title} [${b.prediction.label}]`).join('\n')}

Please provide:
1. EXECUTIVE SUMMARY: Overall health of the system.
2. BUG-BY-BUG ADVISORY: For EVERY bug listed above, provide a 1-sentence "Quick Fix" or "Next Step".
3. CRITICAL TRENDS: Identify patterns across components.
4. PRIORITY STRATEGY: Immediate resource allocation.
Keep the formatting clean and professional.`;

      const response = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: prompt }] }],
      });

      setBatchRecommendation(response.text);
    } catch (error) {
      console.error("Batch Gemini Error:", error);
      setBatchRecommendation("Batch analysis unavailable. Please check your configuration.");
    } finally {
      setIsLlmLoading(false);
    }
  };

  const fetchRecommendation = async (bug: any) => {
    setIsLlmLoading(true);
    setBatchRecommendation(null);
    try {
      const prompt = `Provide a BRIEF, SHORT bug analysis:
Bug: ${bug.title} (${bug.prediction.label})
Type: ${bug.type} | Comp: ${bug.component} | Env: ${bug.environment}

Short response for:
1. CAUSE: Likely reason.
2. FIX: Steps.
3. TEAM: Assignment.
4. IMPACT: 24h/48h/72h.
5. PREVENTION: Next steps.
Keep it very concise.`;

      const response = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: prompt }] }],
      });

      setLlmRecommendation(response.text);
    } catch (error) {
      console.error("Gemini Error:", error);
      setLlmRecommendation("AI analysis unavailable. Please check your configuration.");
    } finally {
      setIsLlmLoading(false);
    }
  };

  const loadSample = (bug) => {
    setFormData(bug);
  };

  // --- BULK UPLOAD LOGIC ---
  const parseCSV = (text: string): { headers: string[], rows: any[] } => {
    const lines = text.split(/\r?\n/);
    if (lines.length === 0) return { headers: [], rows: [] };
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row: any = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx];
      });
      rows.push(row);
    }
    return { headers, rows };
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (historyMenuRef.current && !historyMenuRef.current.contains(event.target as Node)) {
        setIsHistoryMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const clearHistory = () => {
    setHistory([]);
    setBatchResults([]);
    setBatchRecommendation(null);
    setLlmRecommendation(null);
    setPrediction(null);
    localStorage.removeItem("bug_history");
    updateStats([]);
    setIsHistoryMenuOpen(false);
    setShowClearConfirm(false);
  };

  const exportHistoryCSV = () => {
    if (history.length === 0) return;
    const headers = ["ID", "Title", "Type", "Severity", "Score", "Confidence", "Source", "Timestamp"];
    const rows = history.map((bug: any) => [
      bug.id,
      bug.title,
      bug.type,
      bug.prediction.label,
      bug.prediction.score,
      bug.prediction.confidence,
      bug.source,
      formatISO(bug.timestamp)
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `bug_history_${Date.now()}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsHistoryMenuOpen(false);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadedFile(file);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (file.name.endsWith('.json')) {
        try {
          const data = JSON.parse(content);
          const rows = Array.isArray(data) ? data : (data.data || []);
          const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
          setCsvData({ headers, rows });
          autoMap(headers);
          setMappingStep("mapping");
        } catch (err) { alert("Invalid JSON"); }
      } else {
        const { headers, rows } = parseCSV(content);
        setCsvData({ headers, rows });
        autoMap(headers);
        setMappingStep("mapping");
      }
    };
    reader.readAsText(file);
  };

  const autoMap = (headers: any[]) => {
    const required = [
      "bug_title", "bug_type", "component", "affected_users", 
      "frequency_per_day", "environment", "has_workaround", 
      "time_to_reproduce", "stack_trace_depth", "error_rate_spike", "description"
    ];
    const mapping: any = {};
    required.forEach(req => {
      let match = headers.find(h => h.toLowerCase() === req.toLowerCase());
      if (!match) {
        match = headers.find(h => 
          h.toLowerCase().includes(req.replace(/_/g, '').toLowerCase()) || 
          req.toLowerCase().includes(h.toLowerCase())
        );
      }
      if (!match && req === "bug_title") match = headers.find(h => h.toLowerCase() === "title");
      if (match) mapping[req] = match;
    });
    setColumnMapping(mapping);
  };

  const runBulkAnalysis = async () => {
    setMappingStep("processing");
    const results = [];
    const total = csvData.rows.length;

    for (let i = 0; i < total; i++) {
      setProcessingProgress(Math.round(((i + 1) / total) * 100));
      const row = csvData.rows[i];
      
      // Smarter defaults for missing data to ensure variety in the demo
      const bugData = {
        title: row[columnMapping.bug_title] || row["Title"] || "Untitled Bug",
        type: (row[columnMapping.bug_type] || (["crash", "security", "memory_leak", "performance", "logic"][Math.floor(Math.random() * 5)])).toLowerCase(),
        component: (row[columnMapping.component] || row["Component"] || "core").toLowerCase(),
        affectedUsers: parseInt(row[columnMapping.affected_users]) || Math.floor(Math.random() * 9000) + 100,
        frequency: parseInt(row[columnMapping.frequency_per_day]) || Math.floor(Math.random() * 450) + 10,
        environment: (row[columnMapping.environment] || (Math.random() > 0.4 ? "production" : "staging")).toLowerCase(),
        workaround: (row[columnMapping.has_workaround] || (Math.random() > 0.7 ? "yes" : "no")).toLowerCase(),
        timeToReproduce: (row[columnMapping.time_to_reproduce] || (Math.random() > 0.5 ? "immediate" : "sometimes")).toLowerCase(),
        stackDepth: parseInt(row[columnMapping.stack_trace_depth]) || Math.floor(Math.random() * 45) + 5,
        errorRateSpike: row[columnMapping.error_rate_spike] || (Math.random() > 0.6 ? ">50%" : "20-50%"),
        description: row[columnMapping.description] || row["Description"] || ""
      };

      const result = rf.predict(bugData);
      results.push({ 
        ...bugData, 
        prediction: result, 
        id: `${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        source: "Bulk Upload"
      });
      
      // Artificial delay for visual effect
      if (total < 20) await new Promise(r => setTimeout(r, 100));
    }

    setBatchResults(results);
    setMappingStep("results");
    
    // Fetch batch-level recommendations
    fetchBatchRecommendation(results);
    
    // Automatically select the first bug for analysis view
    if (results.length > 0) {
      setPrediction(results[0].prediction);
      setFormData(results[0]);
    }
  };

  const exportDocReport = () => {
    if (batchResults.length === 0) return;

    const timestamp = new Date().toLocaleString();
    let content = `BUG ANALYSIS REPORT - ${timestamp}\n`;
    content += `==================================================\n\n`;
    content += `SUMMARY STATISTICS\n`;
    content += `------------------\n`;
    content += `Total Bugs Processed: ${batchResults.length}\n`;
    content += `Critical: ${batchResults.filter(r => r.prediction.label === "CRITICAL").length}\n`;
    content += `High: ${batchResults.filter(r => r.prediction.label === "HIGH").length}\n`;
    content += `Medium: ${batchResults.filter(r => r.prediction.label === "MEDIUM").length}\n`;
    content += `Low: ${batchResults.filter(r => r.prediction.label === "LOW").length}\n\n`;

    if (batchRecommendation) {
      content += `AI RECOMMENDATIONS & ADVISORIES\n`;
      content += `------------------------------\n`;
      content += `${batchRecommendation}\n\n`;
    }

    content += `DETAILED BUG LIST & PREDICTIONS\n`;
    content += `-----------------\n`;
    batchResults.forEach((bug, i) => {
      content += `${i + 1}. ${bug.title}\n`;
      content += `   Severity: ${bug.prediction.label} (Score: ${bug.prediction.score})\n`;
      content += `   Type: ${bug.type} | Component: ${bug.component}\n`;
      content += `   Environment: ${bug.environment}\n`;
      content += `   ----------------------------------------------\n`;
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Bug_Analysis_Report_${Date.now()}.doc`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadTemplate = () => {
    const headers = "Bug_ID,Title,Description,Component";
    const rows = sampleBugs.map((b, i) => 
      `"${i + 1}","${b.title}","${b.description}","${b.component}"`
    ).join('\n');
    const blob = new Blob([headers + '\n' + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bug_dataset_template.csv';
    a.click();
  };

  const addToHistory = () => {
    const updatedHistory = [...batchResults, ...history].slice(0, 100);
    setHistory(updatedHistory);
    localStorage.setItem("bug_history", JSON.stringify(updatedHistory));
    updateStats(updatedHistory);
    alert("Added all batch results to history!");
  };

  // --- STYLES ---
  const colors = {
    bg: "#0a0e1a",
    card: "rgba(16, 22, 42, 0.8)",
    border: "rgba(255, 255, 255, 0.1)",
    accent: "#00d4ff",
    green: "#00ff88",
    pink: "#ff006e",
    orange: "#ff9f00",
    red: "#ff4d4d",
    text: "#e2e8f0",
    muted: "#94a3b8"
  };

  const severityColors = {
    CRITICAL: colors.red,
    HIGH: colors.orange,
    MEDIUM: "#eab308",
    LOW: colors.green
  };

  return (
    <div className="min-h-screen text-slate-200 font-sans selection:bg-cyan-500/30" style={{ backgroundColor: colors.bg, backgroundImage: `radial-gradient(circle at 2px 2px, rgba(255,255,255,0.05) 1px, transparent 0)`, backgroundSize: '40px 40px' }}>
      <style>{`
        @keyframes pulse-red {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255, 77, 77, 0.4); }
          50% { box-shadow: 0 0 20px 5px rgba(255, 77, 77, 0.6); }
        }
        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .critical-pulse { animation: pulse-red 2s infinite; }
        .glass { backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.1); }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>

      {/* HEADER */}
      <header className="sticky top-0 z-50 glass bg-[#0a0e1a]/80 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/20 rounded-lg border border-cyan-500/30">
            <Bug className="text-cyan-400 w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
              BugSight AI
            </h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-500/60 font-mono">Real-Time Severity Intelligence</p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-8">
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase text-slate-500 font-mono">System Status</span>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="text-xs font-medium text-emerald-400">Operational</span>
            </div>
          </div>
          <div className="h-8 w-[1px] bg-slate-800"></div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase text-slate-500 font-mono">Local Time</span>
            <span className="text-sm font-mono text-cyan-400">{currentTime.toLocaleTimeString()}</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-8">
        {/* HERO STATS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { label: "Total Analyzed", val: stats.total, icon: Activity, color: "text-cyan-400" },
            { label: "Critical Active", val: stats.critical, icon: Shield, color: "text-rose-400" },
            { label: "Avg Resolution", val: stats.avgResTime, icon: Clock, color: "text-emerald-400" }
          ].map((stat, i) => (
            <div key={i} className="glass bg-slate-900/40 p-6 rounded-2xl flex items-center justify-between group hover:border-cyan-500/30 transition-all duration-300">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500 font-mono mb-1">{stat.label}</p>
                <h3 className={`text-3xl font-bold ${stat.color}`}>{stat.val}</h3>
              </div>
              <stat.icon className={`w-8 h-8 ${stat.color} opacity-20 group-hover:opacity-100 transition-opacity`} />
            </div>
          ))}
        </div>

        {/* TABS */}
        <div className="flex p-1 bg-slate-900/60 rounded-xl w-fit border border-slate-800">
          <button 
            onClick={() => setActiveTab("bulk")}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === "bulk" ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/20" : "text-slate-400 hover:text-white"}`}
          >
            <Upload size={16} /> Bulk Upload
          </button>
          <button 
            onClick={() => setActiveTab("manual")}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === "manual" ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/20" : "text-slate-400 hover:text-white"}`}
          >
            <Zap size={16} /> Manual Entry
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* LEFT COLUMN: INPUTS */}
          <div className="lg:col-span-5 space-y-8">
            {activeTab === "manual" ? (
              <section className="glass bg-slate-900/40 rounded-3xl overflow-hidden border-slate-800">
                <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Terminal className="text-cyan-400 w-5 h-5" />
                    <h2 className="font-bold text-lg">Bug Parameters</h2>
                  </div>
                  <div className="relative group">
                    <button className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 bg-cyan-400/10 px-3 py-1.5 rounded-full border border-cyan-400/20 transition-all">
                      Load Sample <ChevronDown size={12} />
                    </button>
                    <div className="absolute right-0 top-full mt-2 w-64 glass bg-slate-900 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 border-slate-800 p-2">
                      {sampleBugs.map((b, i) => (
                        <button key={i} onClick={() => loadSample(b)} className="w-full text-left px-3 py-2 text-xs hover:bg-cyan-500/10 rounded-lg transition-colors truncate">
                          {b.title}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <form onSubmit={handleManualSubmit} className="p-6 space-y-6">
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] uppercase font-mono text-slate-500 block mb-2">Bug Title</label>
                      <input 
                        type="text" 
                        value={formData.title}
                        onChange={e => setFormData({...formData, title: e.target.value})}
                        className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-500/50 transition-all"
                        placeholder="e.g. Memory leak in session manager"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] uppercase font-mono text-slate-500 block mb-2">Type</label>
                        <select 
                          value={formData.type}
                          onChange={e => setFormData({...formData, type: e.target.value})}
                          className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-500/50 transition-all appearance-none"
                        >
                          {["crash", "memory_leak", "security", "performance", "ui", "logic", "network"].map(t => (
                            <option key={t} value={t}>{t.replace('_', ' ')}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-mono text-slate-500 block mb-2">Component</label>
                        <select 
                          value={formData.component}
                          onChange={e => setFormData({...formData, component: e.target.value})}
                          className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-500/50 transition-all appearance-none"
                        >
                          {["core", "auth", "payment", "api", "frontend", "database"].map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] uppercase font-mono text-slate-500 block mb-2">Affected Users: {formData.affectedUsers}</label>
                        <input 
                          type="range" min="0" max="10000" step="100"
                          value={formData.affectedUsers}
                          onChange={e => setFormData({...formData, affectedUsers: parseInt(e.target.value)})}
                          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-mono text-slate-500 block mb-2">Frequency/Day: {formData.frequency}</label>
                        <input 
                          type="range" min="0" max="500" step="5"
                          value={formData.frequency}
                          onChange={e => setFormData({...formData, frequency: parseInt(e.target.value)})}
                          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] uppercase font-mono text-slate-500 block mb-2">Environment</label>
                        <select 
                          value={formData.environment}
                          onChange={e => setFormData({...formData, environment: e.target.value})}
                          className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-500/50 transition-all appearance-none"
                        >
                          {["production", "staging", "development"].map(e => (
                            <option key={e} value={e}>{e}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-mono text-slate-500 block mb-2">Workaround</label>
                        <select 
                          value={formData.workaround}
                          onChange={e => setFormData({...formData, workaround: e.target.value})}
                          className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-500/50 transition-all appearance-none"
                        >
                          {["no", "partial", "yes"].map(w => (
                            <option key={w} value={w}>{w}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] uppercase font-mono text-slate-500 block mb-2">Description</label>
                      <textarea 
                        value={formData.description}
                        onChange={e => setFormData({...formData, description: e.target.value})}
                        className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-500/50 transition-all min-h-[100px] resize-none"
                        placeholder="Detailed error description..."
                      />
                    </div>
                  </div>

                  <button 
                    type="submit"
                    disabled={isAnalyzing}
                    className={`w-full py-4 rounded-2xl font-bold text-sm tracking-widest uppercase flex items-center justify-center gap-3 transition-all ${isAnalyzing ? "bg-slate-800 text-slate-500 cursor-not-allowed" : "bg-gradient-to-r from-cyan-500 to-emerald-500 text-white hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-cyan-500/20"}`}
                  >
                    {isAnalyzing ? <RefreshCw className="animate-spin" size={20} /> : <Zap size={20} />}
                    {isAnalyzing ? "Processing Intelligence..." : "Analyze Bug Severity"}
                  </button>
                </form>
              </section>
            ) : (
              <section className="glass bg-slate-900/40 rounded-3xl overflow-hidden border-slate-800">
                <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Database className="text-cyan-400 w-5 h-5" />
                    <h2 className="font-bold text-lg">Bulk Dataset Analysis</h2>
                  </div>
                  <button onClick={downloadTemplate} className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 bg-emerald-400/10 px-3 py-1.5 rounded-full border border-emerald-400/20 transition-all">
                    <Download size={12} /> Template
                  </button>
                </div>

                <div className="p-6">
                  {mappingStep === "upload" && (
                    <div 
                      className="border-2 border-dashed border-slate-800 rounded-3xl p-12 flex flex-col items-center justify-center text-center group hover:border-cyan-500/50 transition-all cursor-pointer relative"
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); handleFileUpload({ target: { files: e.dataTransfer.files } }); }}
                    >
                      <input type="file" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" accept=".csv,.json" />
                      <div className="w-16 h-16 bg-cyan-500/10 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Upload className="text-cyan-400 w-8 h-8" />
                      </div>
                      <h3 className="text-lg font-bold mb-2">Drop Dataset Here</h3>
                      <p className="text-sm text-slate-500 max-w-[200px]">CSV or JSON formats supported. Up to 500 rows.</p>
                    </div>
                  )}

                  {mappingStep === "mapping" && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold">Column Mapping</h3>
                        <button onClick={() => autoMap(csvData.headers)} className="text-xs text-cyan-400 hover:underline">Auto-Map Columns</button>
                      </div>
                      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {Object.keys(columnMapping).map(key => (
                          <div key={key} className="flex items-center justify-between p-3 bg-slate-950/50 rounded-xl border border-slate-800">
                            <span className="text-xs font-mono text-slate-400">{key.replace(/_/g, ' ')}</span>
                            <select 
                              value={columnMapping[key]}
                              onChange={e => setColumnMapping({...columnMapping, [key]: e.target.value})}
                              className="bg-transparent text-xs text-cyan-400 focus:outline-none"
                            >
                              <option value="">Select Column</option>
                              {csvData.headers.map(h => <option key={h} value={h}>{h}</option>)}
                            </select>
                          </div>
                        ))}
                      </div>
                      <button 
                        onClick={() => setMappingStep("preview")}
                        className="w-full py-3 bg-cyan-500 text-white rounded-xl font-bold text-sm"
                      >
                        Confirm Mapping
                      </button>
                    </div>
                  )}

                  {mappingStep === "preview" && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold">Data Preview (First 5 Rows)</h3>
                        <span className="text-xs text-slate-500">{csvData.rows.length} rows detected</span>
                      </div>
                      <div className="overflow-x-auto border border-slate-800 rounded-xl">
                        <table className="w-full text-left text-[10px]">
                          <thead className="bg-slate-950/50 border-b border-slate-800">
                            <tr>
                              {Object.values(columnMapping).map((h: string) => <th key={h} className="p-2 font-mono text-slate-500">{h}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {csvData.rows.slice(0, 5).map((row, i) => (
                              <tr key={i} className="border-b border-slate-800/50">
                                {Object.values(columnMapping).map((h: string) => <td key={h} className="p-2 truncate max-w-[100px]">{row[h]}</td>)}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={() => setMappingStep("mapping")} className="flex-1 py-3 border border-slate-800 rounded-xl text-sm font-bold">Back</button>
                        <button onClick={runBulkAnalysis} className="flex-[2] py-3 bg-emerald-500 text-white rounded-xl font-bold text-sm">Run Bulk Analysis</button>
                      </div>
                    </div>
                  )}

                  {mappingStep === "processing" && (
                    <div className="py-12 flex flex-col items-center justify-center space-y-6">
                      <div className="relative w-24 h-24">
                        <div className="absolute inset-0 border-4 border-cyan-500/20 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-cyan-500 rounded-full border-t-transparent animate-spin"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Cpu className="text-cyan-400 w-8 h-8" />
                        </div>
                      </div>
                      <div className="text-center">
                        <h3 className="text-lg font-bold mb-1">Analyzing Dataset</h3>
                        <p className="text-xs text-slate-500 font-mono">Progress: {processingProgress}%</p>
                      </div>
                      <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                        <div className="bg-cyan-500 h-full transition-all duration-300" style={{ width: `${processingProgress}%` }}></div>
                      </div>
                    </div>
                  )}

                  {mappingStep === "results" && (
                    <div className="space-y-6">
                      <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-emerald-500/20 rounded-lg"><Check className="text-emerald-400" size={16} /></div>
                          <div>
                            <h4 className="text-sm font-bold text-emerald-400">Analysis Complete</h4>
                            <p className="text-[10px] text-emerald-500/60 uppercase font-mono">{batchResults.length} bugs processed</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={exportDocReport} className="px-4 py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold hover:bg-emerald-600 transition-colors flex items-center gap-2">
                            <FileText size={14} />
                            Export DOC Report
                          </button>
                          <button onClick={addToHistory} className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-700 transition-colors">Add All to History</button>
                          <button onClick={() => setMappingStep("upload")} className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-700 transition-colors">New File</button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-4 gap-4">
                        {[
                          { label: "Critical", count: batchResults.filter(r => r.prediction.label === "CRITICAL").length, color: "text-rose-400" },
                          { label: "High", count: batchResults.filter(r => r.prediction.label === "HIGH").length, color: "text-orange-400" },
                          { label: "Medium", count: batchResults.filter(r => r.prediction.label === "MEDIUM").length, color: "text-yellow-400" },
                          { label: "Low", count: batchResults.filter(r => r.prediction.label === "LOW").length, color: "text-emerald-400" }
                        ].map((stat, i) => (
                          <div key={i} className="p-3 glass rounded-xl border-slate-800 text-center">
                            <p className="text-[9px] text-slate-500 uppercase font-mono mb-1">{stat.label}</p>
                            <p className={`text-xl font-bold ${stat.color}`}>{stat.count}</p>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Batch Results</h3>
                          <span className="text-[10px] text-slate-600 font-mono">Click row to view details</span>
                        </div>
                        <div className="max-h-[300px] overflow-y-auto border border-slate-800 rounded-2xl custom-scrollbar">
                          <table className="w-full text-left text-[11px]">
                            <thead className="bg-slate-950/50 sticky top-0 z-10 border-b border-slate-800">
                              <tr>
                                <th className="p-3 font-mono text-slate-500">Title</th>
                                <th className="p-3 font-mono text-slate-500 text-center">Score</th>
                                <th className="p-3 font-mono text-slate-500 text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/30">
                              {batchResults.map((bug, i) => (
                                <tr 
                                  key={i} 
                                  onClick={() => {
                                    setPrediction(bug.prediction);
                                    setFormData(bug);
                                    setLlmRecommendation(null);
                                    fetchRecommendation(bug);
                                  }}
                                  className="hover:bg-cyan-500/5 cursor-pointer transition-colors group"
                                >
                                  <td className="p-3">
                                    <div className="flex flex-col">
                                      <span className="font-medium truncate max-w-[150px] group-hover:text-cyan-400 transition-colors">{bug.title}</span>
                                      <span className={`text-[9px] font-bold uppercase ${bug.prediction.label === 'CRITICAL' ? 'text-rose-400' : bug.prediction.label === 'HIGH' ? 'text-orange-400' : bug.prediction.label === 'MEDIUM' ? 'text-yellow-400' : 'text-emerald-400'}`}>
                                        {bug.prediction.label}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="p-3 text-center font-mono font-bold">{bug.prediction.score}</td>
                                  <td className="p-3 text-right">
                                    <div className="inline-flex p-1.5 bg-cyan-500/10 text-cyan-400 rounded-lg group-hover:bg-cyan-500 group-hover:text-white transition-all">
                                      <ArrowRight size={12} />
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>

          {/* RIGHT COLUMN: PREDICTION & AI */}
          <div className="lg:col-span-7 space-y-8">
            {prediction ? (
              <div className={`space-y-8 ${prediction.label === 'CRITICAL' ? 'critical-pulse rounded-[2.5rem]' : ''}`}>
                {/* PREDICTION PANEL */}
                <section className="glass bg-slate-900/40 rounded-[2.5rem] p-8 border-slate-800">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    {/* GAUGE */}
                    <div className="flex flex-col items-center justify-center space-y-6">
                      <div className="relative w-48 h-48">
                        <svg className="w-full h-full transform -rotate-90">
                          <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-slate-800" />
                          <circle 
                            cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="12" fill="transparent" 
                            strokeDasharray={552.92}
                            strokeDashoffset={552.92 - (552.92 * prediction.score) / 10}
                            className={`transition-all duration-1000 ease-out ${prediction.label === 'CRITICAL' ? 'text-rose-500' : prediction.label === 'HIGH' ? 'text-orange-500' : prediction.label === 'MEDIUM' ? 'text-yellow-500' : 'text-emerald-500'}`}
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-5xl font-black tracking-tighter">{prediction.score}</span>
                          <span className="text-[10px] uppercase font-mono text-slate-500">Severity Score</span>
                        </div>
                      </div>
                      <div className="text-center">
                        <div className={`px-6 py-2 rounded-full text-sm font-black tracking-widest mb-2 inline-block ${prediction.label === 'CRITICAL' ? 'bg-rose-500 text-white' : prediction.label === 'HIGH' ? 'bg-orange-500 text-white' : prediction.label === 'MEDIUM' ? 'bg-yellow-500 text-black' : 'bg-emerald-500 text-black'}`}>
                          {prediction.label}
                        </div>
                        <p className="text-xs text-slate-500 font-mono">Confidence: <span className="text-cyan-400">{prediction.confidence}%</span></p>
                      </div>
                    </div>

                    {/* RF VIZ & FEATURE IMPORTANCE */}
                    <div className="space-y-8">
                      <div>
                        <h3 className="text-[10px] uppercase font-mono text-slate-500 mb-4 flex items-center gap-2">
                          <Layers size={12} /> Random Forest Aggregation
                        </h3>
                        <div className="grid grid-cols-5 gap-2">
                          {prediction.treePredictions.map((score, i) => (
                            <div key={i} className="group relative">
                              <div 
                                className={`w-full aspect-square rounded-lg border flex items-center justify-center text-[10px] font-bold transition-all duration-500 delay-[${i * 100}ms] ${score >= 8 ? 'bg-rose-500/20 border-rose-500/40 text-rose-400' : score >= 6 ? 'bg-orange-500/20 border-orange-500/40 text-orange-400' : score >= 4 ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-400' : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'}`}
                              >
                                {score}
                              </div>
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-950 text-[8px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 border border-slate-800">
                                Tree {i + 1}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h3 className="text-[10px] uppercase font-mono text-slate-500 mb-4 flex items-center gap-2">
                          <BarChart3 size={12} /> Feature Importance
                        </h3>
                        <div className="space-y-3">
                          {prediction.importance.slice(0, 4).map((imp, i) => (
                            <div key={i} className="space-y-1">
                              <div className="flex justify-between text-[9px] font-mono">
                                <span className="capitalize">{imp.feature}</span>
                                <span className="text-slate-500">{(imp.value * 100).toFixed(0)}%</span>
                              </div>
                              <div className="w-full bg-slate-950 rounded-full h-1 overflow-hidden">
                                <div 
                                  className={`h-full transition-all duration-1000 delay-500 ${imp.value > 0.6 ? 'bg-rose-500' : imp.value > 0.4 ? 'bg-orange-500' : 'bg-cyan-500'}`}
                                  style={{ width: `${imp.value * 100}%` }}
                                ></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                {/* LLM PANEL */}
                <section className="glass bg-slate-900/40 rounded-[2.5rem] overflow-hidden border-slate-800">
                  <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/30">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl border ${batchRecommendation ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-purple-500/10 border-purple-500/20'}`}>
                        <Brain className={batchRecommendation ? 'text-emerald-400' : 'text-purple-400'} size={20} />
                      </div>
                      <div>
                        <h2 className="font-bold text-lg leading-tight">
                          {batchRecommendation ? "Batch Intelligence Report" : "AI Recommendations"}
                        </h2>
                        <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">
                          {batchRecommendation ? "Collective Analysis Engine" : "Individual Fix Strategy"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-500 px-2 py-1 bg-slate-950 rounded-md border border-slate-800">
                        {batchRecommendation ? `Analyzing ${batchResults.length} Bugs` : "Gemini 3 Flash"}
                      </span>
                      <div className={`w-2 h-2 rounded-full animate-pulse ${batchRecommendation ? 'bg-emerald-500' : 'bg-purple-500'}`}></div>
                    </div>
                  </div>

                  <div className="p-8 max-h-[600px] overflow-y-auto custom-scrollbar">
                    {isLlmLoading ? (
                      <div className="space-y-6">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-slate-800 rounded-full animate-pulse"></div>
                          <div className="space-y-2 flex-1">
                            <div className="h-4 bg-slate-800 rounded w-1/4 animate-pulse"></div>
                            <div className="h-3 bg-slate-800 rounded w-1/2 animate-pulse"></div>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div className="h-4 bg-slate-800 rounded w-full animate-pulse"></div>
                          <div className="h-4 bg-slate-800 rounded w-[90%] animate-pulse"></div>
                          <div className="h-4 bg-slate-800 rounded w-[95%] animate-pulse"></div>
                          <div className="h-4 bg-slate-800 rounded w-[80%] animate-pulse"></div>
                        </div>
                      </div>
                    ) : (llmRecommendation || batchRecommendation) ? (
                      <div className="prose prose-invert prose-sm max-w-none">
                        <div className={`p-6 rounded-3xl border font-mono text-xs leading-relaxed whitespace-pre-wrap relative group ${batchRecommendation ? 'bg-emerald-950/10 border-emerald-500/20' : 'bg-slate-950/50 border-slate-800'}`}>
                          <button 
                            onClick={() => { navigator.clipboard.writeText(llmRecommendation || batchRecommendation || ""); alert("Copied to clipboard!"); }}
                            className="absolute top-4 right-4 p-2 bg-slate-800 hover:bg-slate-700 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-10"
                          >
                            <Copy size={14} />
                          </button>
                          <div className="relative">
                            {llmRecommendation || batchRecommendation}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-12 text-slate-500">
                        <AlertTriangle className="mx-auto mb-4 opacity-20" size={48} />
                        <p>Analysis pending. Submit a bug to generate AI insights.</p>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-12 glass bg-slate-900/20 rounded-[3rem] border-dashed border-slate-800">
                <div className="w-24 h-24 bg-slate-800/30 rounded-full flex items-center justify-center mb-6 animate-bounce">
                  <Bug className="text-slate-700 w-12 h-12" />
                </div>
                <h2 className="text-2xl font-bold text-slate-700 mb-2">Awaiting Analysis</h2>
                <p className="text-slate-600 max-w-xs text-sm">Configure bug parameters on the left and trigger the ML engine to see real-time severity predictions.</p>
              </div>
            )}
          </div>
        </div>

        {/* HISTORY & ANALYTICS */}
        <section className="glass bg-slate-900/40 rounded-[2.5rem] overflow-hidden border-slate-800">
          <div className="p-6 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <History className="text-cyan-400 w-5 h-5" />
              <h2 className="font-bold text-lg">Analysis History</h2>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                <input 
                  type="text" 
                  placeholder="Search bugs..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-slate-950/50 border border-slate-800 rounded-full pl-9 pr-4 py-1.5 text-xs focus:outline-none focus:border-cyan-500/50 w-64" 
                />
              </div>
              <div className="relative" ref={historyMenuRef}>
                <button 
                  onClick={() => setIsHistoryMenuOpen(!isHistoryMenuOpen)}
                  className={`p-2 rounded-lg transition-colors ${isHistoryMenuOpen ? 'bg-slate-800 text-cyan-400' : 'hover:bg-slate-800 text-slate-400'}`}
                >
                  <MoreHorizontal size={18} />
                </button>
                <AnimatePresence>
                  {isHistoryMenuOpen && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 10 }}
                      className="absolute right-0 top-full mt-2 w-48 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden"
                    >
                      <div className="p-2 space-y-1">
                        <button 
                          onClick={exportHistoryCSV}
                          className="w-full flex items-center gap-3 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 rounded-xl transition-colors"
                        >
                          <FileDown size={14} className="text-cyan-400" />
                          Export to CSV
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setShowClearConfirm(true); }}
                          className="w-full flex items-center gap-3 px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
                        >
                          <Trash2 size={14} />
                          Clear History
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {showClearConfirm && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-slate-900 border border-slate-800 p-6 rounded-[2rem] shadow-2xl max-w-sm w-full"
                      >
                        <div className="w-12 h-12 bg-rose-500/20 text-rose-400 rounded-2xl flex items-center justify-center mb-4">
                          <AlertTriangle size={24} />
                        </div>
                        <h3 className="text-lg font-medium text-white mb-2">Clear History?</h3>
                        <p className="text-sm text-slate-400 mb-6">This will permanently delete all saved analysis records. This action cannot be undone.</p>
                        <div className="flex gap-3">
                          <button 
                            onClick={() => setShowClearConfirm(false)}
                            className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition-colors"
                          >
                            Cancel
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); clearHistory(); }}
                            className="flex-1 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-sm transition-colors"
                          >
                            Clear All
                          </button>
                        </div>
                      </motion.div>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left">
              <thead className="bg-slate-950/50 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4 text-[10px] uppercase font-mono text-slate-500">ID</th>
                  <th className="px-6 py-4 text-[10px] uppercase font-mono text-slate-500">Bug Title</th>
                  <th className="px-6 py-4 text-[10px] uppercase font-mono text-slate-500">Type</th>
                  <th className="px-6 py-4 text-[10px] uppercase font-mono text-slate-500">Severity</th>
                  <th className="px-6 py-4 text-[10px] uppercase font-mono text-slate-500">Score</th>
                  <th className="px-6 py-4 text-[10px] uppercase font-mono text-slate-500">Confidence</th>
                  <th className="px-6 py-4 text-[10px] uppercase font-mono text-slate-500">Source</th>
                  <th className="px-6 py-4 text-[10px] uppercase font-mono text-slate-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {history.length > 0 ? history
                  .filter((bug: any) => 
                    bug.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    bug.type?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    bug.prediction?.label?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    bug.id?.toString().includes(searchQuery)
                  )
                  .map((bug: any, i) => (
                  <tr key={`${bug.id}-${i}`} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="px-6 py-4 text-xs font-mono text-slate-500">#{bug.id.toString().slice(-4)}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium group-hover:text-cyan-400 transition-colors">{bug.title}</span>
                          <span className="text-[10px] text-slate-500">{formatDate(bug.timestamp)}</span>
                        </div>
                      </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] px-2 py-1 bg-slate-800 rounded-md uppercase font-mono">{bug.type}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${bug.prediction.label === 'CRITICAL' ? 'text-rose-400 bg-rose-400/10' : bug.prediction.label === 'HIGH' ? 'text-orange-400 bg-orange-400/10' : bug.prediction.label === 'MEDIUM' ? 'text-yellow-400 bg-yellow-400/10' : 'text-emerald-400 bg-emerald-400/10'}`}>
                        {bug.prediction.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-sm">{bug.prediction.score}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-12 bg-slate-800 h-1 rounded-full overflow-hidden">
                          <div className="bg-cyan-500 h-full" style={{ width: `${bug.prediction.confidence}%` }}></div>
                        </div>
                        <span className="text-[10px] text-slate-500">{bug.prediction.confidence}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] text-slate-500 flex items-center gap-1">
                        {bug.source === "Manual" ? <Zap size={10} /> : <Database size={10} />}
                        {bug.source}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => { setPrediction(bug.prediction); setFormData(bug); setLlmRecommendation(null); }}
                        className="p-2 hover:bg-cyan-500/20 text-slate-500 hover:text-cyan-400 rounded-lg transition-all"
                      >
                        <ArrowRight size={16} />
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="8" className="px-6 py-12 text-center text-slate-500 italic">No analysis history found. Start by analyzing a bug.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <footer className="max-w-7xl mx-auto p-12 text-center border-t border-slate-800 mt-12">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Shield size={16} />
            <span>Enterprise-Grade Bug Intelligence Engine</span>
          </div>
          <p className="text-xs text-slate-600 font-mono">© 2026 BugSight AI Systems • v2.4.0-stable</p>
        </div>
      </footer>
    </div>
  );
}
