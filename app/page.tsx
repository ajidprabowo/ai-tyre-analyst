'use client';

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
// Removed GoogleGenAI schemas and instructions as they are now handled by the backend API.

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<TireData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Load history from localStorage on mounting to avoid hydration mismatch
  React.useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('tire_extractor_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  // Save history to localStorage whenever it changes (only after mounting)
  React.useEffect(() => {
    if (mounted) {
      localStorage.setItem('tire_extractor_history', JSON.stringify(history));
    }
  }, [history, mounted]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles(prev => [...prev, ...acceptedFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png'],
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv']
    }
  });

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = reader.result?.toString().split(',')[1];
        resolve(base64 || '');
      };
      reader.onerror = error => reject(error);
    });
  };

  const processFiles = async () => {
    if (files.length === 0) return;

    setLoading(true);
    setError(null);
    setProgress({ current: 0, total: files.length });
    const allData: TireData[] = [];
    const processedFilesList: { name: string; count: number; data: TireData[] }[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(prev => ({ ...prev, current: i + 1 }));
        
        let payload: any;

        if (file.type.includes('spreadsheet') || file.type.includes('excel') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
          // Process Excel/CSV
          const data = await file.arrayBuffer();
          const workbook = XLSX.read(data);
          let fullText = "";
          
          workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            const csv = XLSX.utils.sheet_to_csv(worksheet);
            fullText += `--- Sheet: ${sheetName} ---\n${csv}\n\n`;
          });

          payload = { type: "text", text: fullText };
        } else {
          // Process PDF/Image
          const base64 = await fileToBase64(file);
          payload = { type: "inlineData", mimeType: file.type, data: base64 };
        }

        const res = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const resultData = await res.json();
        
        if (!res.ok) {
          throw new Error(resultData.error || "Failed to process file.");
        }

        const parsed = resultData.data as TireData[];
        if (parsed) {
          allData.push(...parsed);
          processedFilesList.push({
            name: file.name,
            count: parsed.length,
            data: parsed
          });
        }
      }

      // Add to history
      const newHistoryEntries: HistoryEntry[] = processedFilesList.map(f => ({
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toLocaleString(),
        fileName: f.name,
        unitCount: f.count,
        data: f.data
      }));

      setHistory(prev => [...newHistoryEntries, ...prev]);
      setResults(allData);
      setFiles([]);
      setActiveHistoryId(null);
    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : "Failed to extract data. Please ensure the files are clearly readable.";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const deleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(item => item.id !== id));
    if (activeHistoryId === id) {
      setActiveHistoryId(null);
      setResults([]);
    }
  };

  const loadHistoryItem = (entry: HistoryEntry) => {
    setResults(entry.data);
    setActiveHistoryId(entry.id);
  };

  const exportToExcel = () => {
    if (results.length === 0) return;

    const worksheet = XLSX.utils.json_to_sheet(results.map(item => ({
      'Date': item.date,
      'Unit ID': item.unitId,
      'SMU': item.smu,
      'Pos 1': item.pos1,
      'Pos 2': item.pos2,
      'Pos 3': item.pos3,
      'Pos 4': item.pos4,
      'Pos 5': item.pos5,
      'Pos 6': item.pos6,
      'Pos 7': item.pos7,
      'Pos 8': item.pos8,
      'Pos 9': item.pos9,
      'Pos 10': item.pos10,
    })));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Tire Inspections");

    // Fix column widths
    const maxWidths = Object.keys(results[0]).map(() => ({ wch: 12 }));
    worksheet['!cols'] = maxWidths;

    XLSX.writeFile(workbook, `Tire_Pressure_Inspection_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const generateMarkdownTable = () => {
    if (results.length === 0) return "";

    let table = "| Date | Unit ID | SMU | Pos 1 | Pos 2 | Pos 3 | Pos 4 | Pos 5 | Pos 6 | Pos 7 | Pos 8 | Pos 9 | Pos 10 |\n";
    table += "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n";

    results.forEach(row => {
      table += `| ${row.date} | ${row.unitId} | ${row.smu} | ${row.pos1} | ${row.pos2} | ${row.pos3} | ${row.pos4} | ${row.pos5} | ${row.pos6} | ${row.pos7} | ${row.pos8} | ${row.pos9} | ${row.pos10} |\n`;
    });

    return table;
  };

  const filteredResults = results.filter(row => 
    row.unitId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#020617] text-slate-300 font-sans p-6 md:p-12 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-[-100px] left-[-100px] w-[400px] h-[400px] bg-cyan-900/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-100px] right-[-100px] w-[500px] h-[500px] bg-indigo-900/20 rounded-full blur-[150px] pointer-events-none"></div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <header className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-cyan-400 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <FileText className="w-7 h-7 text-white" />
            </div>
            <div>
              <motion.h1 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-2xl font-bold tracking-tight text-white uppercase"
              >
                TYRE<span className="text-cyan-400 font-light">EXTRACTOR</span>
                <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded ml-2 border border-slate-700 tracking-normal">AI v3.0</span>
              </motion.h1>
              <motion.p 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="text-xs text-slate-500 mt-1"
              >
                AI-Powered Document Inspection & Data Extraction
              </motion.p>
            </div>
          </div>

          {results.length > 0 && (
            <div className="flex gap-3">
              <button
                onClick={() => { setResults([]); setActiveHistoryId(null); }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm border border-slate-700 transition-all flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Clear View
              </button>
              <button
                onClick={exportToExcel}
                className="px-6 py-2 bg-cyan-500 hover:bg-cyan-400 text-[#020617] font-bold rounded-lg text-sm shadow-lg shadow-cyan-500/30 transition-all flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export to Excel
              </button>
            </div>
          )}
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar: Inputs & Rules */}
          <div className="lg:col-span-1 space-y-6">
            <section className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 backdrop-blur-md">
              <h2 className="text-xs font-bold uppercase tracking-widest text-cyan-500 mb-4">Input Source</h2>
              <div 
                {...getRootProps()} 
                className={`border-2 border-dashed rounded-xl p-8 transition-all cursor-pointer flex flex-col items-center justify-center text-center group
                  ${isDragActive ? 'border-cyan-500 bg-cyan-500/5' : 'border-slate-700 hover:border-cyan-500/50 bg-slate-900/60'}`}
              >
                <input {...getInputProps()} />
                <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Upload className="w-6 h-6 text-slate-400 group-hover:text-cyan-400" />
                </div>
                <p className="text-xs text-slate-400 font-medium">Drop inspection PDF/JPG/Excel here</p>
                <p className="text-[10px] text-slate-600 mt-2">Maximum file size: 10MB</p>
              </div>

              {/* File List */}
              <AnimatePresence>
                {files.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="mt-6 pt-6 border-t border-slate-800"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                        Processing Queue ({files.length})
                      </h3>
                    </div>
                    <ul className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                      {files.map((file, i) => (
                        <li key={i} className="flex items-center justify-between text-xs bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                          <span className="truncate max-w-[140px] text-slate-300 underline decoration-slate-700 underline-offset-4">{file.name}</span>
                          <button onClick={(e) => { e.stopPropagation(); removeFile(i); }} className="text-slate-500 hover:text-red-500 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={processFiles}
                      disabled={loading}
                      className="w-full mt-4 bg-white text-black py-3 rounded-xl font-bold text-sm hover:bg-slate-200 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed flex flex-col items-center justify-center gap-2 transition-all shadow-xl shadow-white/5 overflow-hidden"
                    >
                      <div className="flex items-center gap-2">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        {loading ? `PROCESSING ${progress.current}/${progress.total}` : 'EXTRACT DATA'}
                      </div>
                      
                      {loading && (
                        <div className="w-full bg-slate-700 h-1 absolute bottom-0 left-0">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${(progress.current / progress.total) * 100}%` }}
                            className="h-full bg-cyan-500"
                          />
                        </div>
                      )}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {error && (
                <div className="mt-4 bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex gap-3 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <p>{error}</p>
                </div>
              )}
            </section>


            <section className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 backdrop-blur-md">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-bold uppercase tracking-widest text-cyan-500">History</h2>
                {history.length > 0 && (
                  <button 
                    onClick={() => { if(confirm("Clear all history?")) setHistory([]); }}
                    className="text-[10px] text-slate-600 hover:text-red-500 transition-colors uppercase font-mono"
                  >
                    Clear All
                  </button>
                )}
              </div>
              <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar pr-2">
                {history.length === 0 ? (
                  <p className="text-[10px] text-slate-600 italic">No previous extractions found.</p>
                ) : (
                  history.map((entry) => (
                    <button
                      key={entry.id}
                      onClick={() => loadHistoryItem(entry)}
                      className={`w-full text-left p-3 rounded-xl border transition-all group ${
                        activeHistoryId === entry.id 
                        ? 'bg-cyan-500/10 border-cyan-500/30' 
                        : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className={`text-[10px] font-bold ${activeHistoryId === entry.id ? 'text-cyan-400' : 'text-slate-400'}`}>
                          {entry.timestamp.split(',')[0]}
                        </span>
                        <div onClick={(e) => deleteHistoryItem(entry.id, e)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-red-500 pointer-events-auto">
                           <Trash2 className="w-3 h-3" />
                        </div>
                      </div>
                      <p className="text-xs font-medium text-slate-200 truncate mb-1">{entry.fileName}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded border border-slate-700 uppercase tracking-tighter">
                          {entry.unitCount} Units
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>
          </div>

          {/* Main Content: Results */}
          <div className="lg:col-span-3">
            <section className="bg-slate-900/20 border border-slate-800 rounded-2xl overflow-hidden backdrop-blur-md flex flex-col min-h-[600px]">
              <div className="p-5 bg-slate-800/40 border-b border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                    <h2 className="text-xs font-bold uppercase tracking-widest text-white">
                      {activeHistoryId ? 'Historical Data' : 'Extraction Pipeline Results'}
                    </h2>
                  </div>
                  {activeHistoryId && (
                    <p className="text-[10px] text-cyan-500 font-mono">Viewing record from {history.find(h => h.id === activeHistoryId)?.timestamp}</p>
                  )}
                </div>
                
                <div className="flex items-center gap-4 w-full md:w-auto">
                  {results.length > 0 && (
                    <div className="relative flex-1 md:flex-initial">
                      <input 
                        type="text"
                        placeholder="Search Unit ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full md:w-64 bg-slate-900 border border-slate-700 rounded-lg px-4 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 transition-all placeholder:text-slate-600"
                      />
                      {searchTerm && (
                        <button 
                          onClick={() => setSearchTerm("")}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  )}
                  {results.length > 0 && (
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/20 whitespace-nowrap">
                      {searchTerm ? `${filteredResults.length} of ${results.length}` : results.length} Units Identified
                    </span>
                  )}
                </div>
              </div>

              <div className="flex-1 p-0 overflow-hidden flex flex-col">
                {results.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[500px] text-slate-500">
                    <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center mb-6 border border-slate-700/50">
                      <FileText className="w-8 h-8 opacity-20" />
                    </div>
                    <p className="font-bold text-slate-300 uppercase tracking-tighter text-lg">No Active Session</p>
                    <p className="text-xs text-slate-600 mt-1 max-w-[240px] text-center">Upload documents in the sidebar to populate the extraction grid.</p>
                    
                    <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-2xl px-8">
                      {[
                        { title: "UPLOAD", desc: "Digital/Scanned Files" },
                        { title: "ANALYZE", desc: "Vision-Language OCR" },
                        { title: "EXPORT", desc: "Production Ready .xlsx" }
                      ].map((step, i) => (
                        <div key={i} className="bg-slate-900/40 p-5 rounded-xl border border-slate-800/50 text-center flex flex-col items-center">
                          <span className="text-[10px] font-bold text-cyan-500/50 mb-2 font-mono">0{i+1}</span>
                          <p className="text-xs font-bold text-slate-400 tracking-widest">{step.title}</p>
                          <p className="text-[10px] text-slate-600 mt-1 leading-tight uppercase font-light">{step.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 overflow-auto custom-scrollbar scale-in">
                    <table className="w-full text-left border-collapse min-w-[1000px]">
                      <thead className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800">
                        <tr>
                          <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Date</th>
                          <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Unit ID</th>
                          <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">SMU</th>
                          <th className="p-4 text-[10px] font-bold text-cyan-500 uppercase tracking-widest text-center border-l border-slate-800/50">P1</th>
                          <th className="p-4 text-[10px] font-bold text-cyan-500 uppercase tracking-widest text-center">P2</th>
                          <th className="p-4 text-[10px] font-bold text-cyan-500 uppercase tracking-widest text-center">P3</th>
                          <th className="p-4 text-[10px] font-bold text-cyan-500 uppercase tracking-widest text-center">P4</th>
                          <th className="p-4 text-[10px] font-bold text-cyan-500 uppercase tracking-widest text-center">P5</th>
                          <th className="p-4 text-[10px] font-bold text-cyan-500 uppercase tracking-widest text-center">P6</th>
                          <th className="p-4 text-[10px] font-bold text-cyan-500 uppercase tracking-widest text-center border-l border-slate-800/50">P7</th>
                          <th className="p-4 text-[10px] font-bold text-cyan-500 uppercase tracking-widest text-center">P8</th>
                          <th className="p-4 text-[10px] font-bold text-cyan-500 uppercase tracking-widest text-center">P9</th>
                          <th className="p-4 text-[10px] font-bold text-cyan-500 uppercase tracking-widest text-center">P10</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/30">
                        {filteredResults.map((row, idx) => (
                          <tr key={idx} className="hover:bg-cyan-500/5 transition-colors group">
                            <td className="p-4 text-xs text-slate-400 whitespace-nowrap">{row.date || '-'}</td>
                            <td className="p-4 text-sm font-bold text-white whitespace-nowrap">
                              <span className="bg-slate-800 px-2 py-1 rounded border border-slate-700">{row.unitId || '-'}</span>
                            </td>
                            <td className="p-4 text-xs font-mono text-slate-300">{row.smu || '-'}</td>
                            <td className="p-4 text-sm font-medium text-center text-slate-300 border-l border-slate-800/30">{row.pos1 || <span className="text-slate-800">—</span>}</td>
                            <td className="p-4 text-sm font-medium text-center text-slate-300">{row.pos2 || <span className="text-slate-800">—</span>}</td>
                            <td className="p-4 text-sm font-medium text-center text-slate-300">{row.pos3 || <span className="text-slate-800">—</span>}</td>
                            <td className="p-4 text-sm font-medium text-center text-slate-300">{row.pos4 || <span className="text-slate-800">—</span>}</td>
                            <td className="p-4 text-sm font-medium text-center text-slate-300">{row.pos5 || <span className="text-slate-800">—</span>}</td>
                            <td className="p-4 text-sm font-medium text-center text-slate-300">{row.pos6 || <span className="text-slate-800">—</span>}</td>
                            <td className="p-4 text-sm font-medium text-center text-slate-300 border-l border-slate-800/30">{row.pos7 || <span className="text-slate-800">—</span>}</td>
                            <td className="p-4 text-sm font-medium text-center text-slate-300">{row.pos8 || <span className="text-slate-800">—</span>}</td>
                            <td className="p-4 text-sm font-medium text-center text-slate-300">{row.pos9 || <span className="text-slate-800">—</span>}</td>
                            <td className="p-4 text-sm font-medium text-center text-slate-300">{row.pos10 || <span className="text-slate-800">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex justify-between items-center text-[10px] text-slate-600 font-mono tracking-widest">
                <div className="flex gap-6">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-sm shadow-cyan-500/50"></div>
                    <span>SYSTEM READY // ADAPTIVE COLUMN MAPPING</span>
                  </div>
                  <div className="hidden sm:flex items-center gap-2 border-l border-slate-800 pl-6">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                    <span>ENGINE: GEMINI-3-FLASH</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-slate-700">
                  <span>DATA PERSISTENCE: SESSION ONLY</span>
                </div>
              </div>
            </section>
          </div>
        </div>

      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #020617;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #1e293b;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #334155;
        }

        .markdown-body table {
          border-collapse: collapse;
          width: 100%;
          font-size: 11px;
          color: #94a3b8;
          font-family: ui-sans-serif, system-ui, -apple-system;
        }
        .markdown-body thead {
          position: sticky;
          top: 0;
          z-index: 20;
          background-color: #0f172a;
        }
        .markdown-body th {
          border-bottom: 1px solid #1e293b;
          padding: 12px;
          text-align: left;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #64748b;
          font-weight: 700;
        }
        .markdown-body td {
          border-bottom: 1px solid #1e293b44;
          padding: 12px;
          color: #cbd5e1;
          transition: background-color 0.2s;
        }
        .markdown-body tr:hover td {
          background-color: rgba(34, 211, 238, 0.05);
          color: #f8fafc;
        }
        .markdown-body tr td:nth-child(2) {
          font-weight: 800;
          color: #ffffff;
        }
        /* Highlight P1-P10 columns slightly with cyan tint */
        .markdown-body th:nth-child(n+4), 
        .markdown-body td:nth-child(n+4) {
          text-align: center;
        }
        .markdown-body th:nth-child(n+4) {
          color: #22d3ee;
        }

        @keyframes scale-in {
          0% { transform: scale(0.98); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .scale-in {
          animation: scale-in 0.4s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
