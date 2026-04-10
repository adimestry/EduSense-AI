import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  FileText, Upload, Brain, Key, Search, MessageSquare, 
  Settings, Zap, Share2, Download, Copy, Sparkles, 
  ChevronRight, BookOpen, Target, Microscope, AlertCircle, 
  CheckCircle2, Globe, GraduationCap, Info, HelpCircle, History, Trash2, Clock,
  LogOut, User as UserIcon, LogIn, UserCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as d3 from 'd3';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid 
} from 'recharts';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { analyzeDocument, chatWithDocument, getRelatedResearch, AnalysisResult } from './lib/gemini';
import { extractTextFromPDF } from './lib/pdf';
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged, User } from './lib/firebase';

// --- Types ---

interface HistoryItem {
  id: string;
  title: string;
  timestamp: number;
  analysis: AnalysisResult;
  relatedResearch: any[];
  sourceInfo: string | { name: string; type: string };
  analyzedSource: string | File; // Note: File won't persist in localStorage, we'll handle this
}

// --- Components ---

const StarField = () => {
  const stars = useMemo(() => {
    return Array.from({ length: 100 }).map((_, i) => ({
      id: i,
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 100}%`,
      size: `${Math.random() * 2 + 1}px`,
      duration: `${Math.random() * 3 + 2}s`,
    }));
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {stars.map((star) => (
        <div
          key={star.id}
          className="star"
          style={{
            top: star.top,
            left: star.left,
            width: star.size,
            height: star.size,
            '--duration': star.duration,
          } as any}
        />
      ))}
    </div>
  );
};

const MindMap = ({ keywords }: { keywords: { word: string; definition: string }[] }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || keywords.length === 0) return;

    const width = 800;
    const height = 400;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const nodes = [
      { id: "Root", label: "Core Concepts", group: 0 },
      ...keywords.map((k, i) => ({ id: k.word, label: k.word, group: 1 }))
    ];

    const links = keywords.map(k => ({ source: "Root", target: k.word }));

    const simulation = d3.forceSimulation(nodes as any)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const link = svg.append("g")
      .attr("stroke", "rgba(99, 102, 241, 0.3)")
      .attr("stroke-width", 1.5)
      .selectAll("line")
      .data(links)
      .join("line");

    const node = svg.append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .call(d3.drag<any, any>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    node.append("circle")
      .attr("r", (d: any) => d.id === "Root" ? 15 : 8)
      .attr("fill", (d: any) => d.id === "Root" ? "#6366f1" : "rgba(99, 102, 241, 0.6)")
      .attr("class", "constellation-node");

    node.append("text")
      .text((d: any) => d.label)
      .attr("x", 12)
      .attr("y", 4)
      .attr("fill", "#f8fafc")
      .attr("font-size", "12px")
      .attr("font-weight", (d: any) => d.id === "Root" ? "bold" : "normal");

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }
  }, [keywords]);

  return (
    <div className="w-full h-[400px] glass-card rounded-xl overflow-hidden relative">
      <div className="absolute top-4 left-4 z-10">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          Knowledge Constellation
        </h3>
      </div>
      <svg ref={svgRef} className="w-full h-full" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid meet" />
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [summaryLength, setSummaryLength] = useState(250);
  const [languageMode, setLanguageMode] = useState<"Academic" | "Simple" | "ELI5">("Academic");
  const [chatHistory, setChatHistory] = useState<{ role: string; parts: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const [relatedResearch, setRelatedResearch] = useState<any[]>([]);
  const [isFetchingResearch, setIsFetchingResearch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [uploadType, setUploadType] = useState<'file' | 'link'>('file');
  const [analyzedSource, setAnalyzedSource] = useState<File | string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const saved = localStorage.getItem('edusense_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  useEffect(() => {
    localStorage.setItem('edusense_history', JSON.stringify(history));
  }, [history]);

  const saveToHistory = (title: string, analysis: AnalysisResult, research: any[], source: any) => {
    const newItem: HistoryItem = {
      id: Math.random().toString(36).substr(2, 9),
      title,
      timestamp: Date.now(),
      analysis,
      relatedResearch: research,
      sourceInfo: source instanceof File ? { name: source.name, type: source.type } : source,
      analyzedSource: source instanceof File ? "" : source // Can't easily store File in localStorage
    };
    setHistory(prev => {
      const filtered = prev.filter(item => item.title !== title);
      return [newItem, ...filtered].slice(0, 10);
    });
  };

  const loadFromHistory = (item: HistoryItem) => {
    setAnalysis(item.analysis);
    setRelatedResearch(item.relatedResearch);
    setAnalyzedSource(item.analyzedSource || null);
    if (typeof item.sourceInfo === 'string') {
      setUrlInput(item.sourceInfo);
      setUploadType('link');
    } else {
      setFile(null); // We don't have the original File object anymore
      setUploadType('file');
    }
    setIsHistoryOpen(false);
  };

  const deleteFromHistory = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Login failed:", err);
      setError("Failed to sign in with Google.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setAnalysis(null);
      setFile(null);
      setText('');
      setChatHistory([]);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setIsAnalyzing(true);
      setError(null);
      try {
        let extractedText = '';
        try {
          extractedText = await extractTextFromPDF(selectedFile);
          setText(extractedText);
        } catch (pdfErr) {
          console.warn("Local PDF extraction failed, falling back to direct AI analysis:", pdfErr);
        }

        // Use file directly if text extraction failed or returned empty
        const analysisInput = extractedText.trim() ? extractedText : selectedFile;
        const result = await analyzeDocument(analysisInput, summaryLength, languageMode);
        setAnalysis(result);
        setAnalyzedSource(analysisInput);
        
        // Fetch related research based on top keywords
        setIsFetchingResearch(true);
        const research = await getRelatedResearch(result.keywords.slice(0, 3).map(k => k.word));
        setRelatedResearch(research);
        saveToHistory(selectedFile.name, result, research, selectedFile);
      } catch (err) {
        console.error("Analysis failed:", err);
        setError(err instanceof Error ? err.message : "An unexpected error occurred during analysis.");
        setFile(null);
      } finally {
        setIsAnalyzing(false);
        setIsFetchingResearch(false);
      }
    } else if (selectedFile) {
      setError("Please upload a valid PDF file.");
    }
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    setIsAnalyzing(true);
    setError(null);
    setFile(null);
    setText('');
    
    try {
      const result = await analyzeDocument(urlInput, summaryLength, languageMode);
      setAnalysis(result);
      setAnalyzedSource(urlInput);
      
      setIsFetchingResearch(true);
      const research = await getRelatedResearch(result.keywords.slice(0, 3).map(k => k.word));
      setRelatedResearch(research);
      saveToHistory(urlInput, result, research, urlInput);
    } catch (err) {
      console.error("URL Analysis failed:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred during URL analysis.");
    } finally {
      setIsAnalyzing(false);
      setIsFetchingResearch(false);
    }
  };

  const handleModeChange = async (mode: "Academic" | "Simple" | "ELI5") => {
    setLanguageMode(mode);
    if (analyzedSource) {
      setIsAnalyzing(true);
      try {
        const result = await analyzeDocument(analyzedSource, summaryLength, mode);
        setAnalysis(result);
      } catch (error) {
        console.error("Re-analysis failed:", error);
      } finally {
        setIsAnalyzing(false);
      }
    }
  };

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatting) return;

    const userMessage = chatInput;
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', parts: userMessage }]);
    setIsChatting(true);

    try {
      if (!analyzedSource) throw new Error("No document context available");
      
      const response = await chatWithDocument(analyzedSource, chatHistory, userMessage);
      setChatHistory(prev => [...prev, { role: 'model', parts: response }]);
    } catch (error) {
      console.error("Chat failed:", error);
    } finally {
      setIsChatting(false);
    }
  };

  const COLORS = ['#6366f1', '#10b981', '#fbbf24', '#f43f5e', '#8b5cf6'];

  return (
    <TooltipProvider>
      <div className="min-h-screen relative pb-20">
        <StarField />
        
        {/* Header */}
        <header className="relative z-10 border-b border-white/10 bg-space-bg/50 backdrop-blur-md sticky top-0">
          <div className="container mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-serif font-bold tracking-tight text-white">EduSense AI</h1>
                <p className="text-[9px] text-indigo-300 uppercase tracking-[0.2em] font-bold">Academic Intelligence System</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {user && (
                <>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-white/70 hover:text-white font-medium"
                    onClick={() => setIsHistoryOpen(true)}
                  >
                    <History className="w-4 h-4 mr-2" />
                    History
                  </Button>
                  <Button variant="ghost" size="sm" className="text-white/70 hover:text-white font-medium">
                    <Share2 className="w-4 h-4 mr-2" />
                    Share
                  </Button>
                  <Button variant="outline" size="sm" className="border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 font-medium">
                    <Download className="w-4 h-4 mr-2" />
                    Export Analysis
                  </Button>
                  <Separator orientation="vertical" className="h-6 bg-white/10" />
                  <div className="flex items-center gap-3 pl-2">
                    <div className="text-right hidden sm:block">
                      <p className="text-xs font-bold text-white leading-none">{user.displayName}</p>
                      <p className="text-[10px] text-slate-500 mt-1">Researcher</p>
                    </div>
                    <Tooltip>
                      <TooltipTrigger 
                        render={
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={handleLogout}
                            className="rounded-full hover:bg-red-500/10 hover:text-red-400 text-slate-400"
                          >
                            <LogOut className="w-4 h-4" />
                          </Button>
                        }
                      />
                      <TooltipContent>Sign Out</TooltipContent>
                    </Tooltip>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-8 relative z-10">
          {isAuthLoading ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full mb-4"
              />
              <p className="text-indigo-300 font-medium animate-pulse">Initializing Secure Session...</p>
            </div>
          ) : !user ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-md mx-auto mt-20"
            >
              <Card className="glass-card border-none rounded-3xl overflow-hidden p-8 text-center">
                <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-indigo-500/40 transform -rotate-6">
                  <Brain className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-3xl font-serif font-bold mb-4">Welcome to EduSense AI</h2>
                <p className="text-slate-400 mb-10 leading-relaxed">Sign in to access your academic intelligence dashboard and secure your research history.</p>
                
                <Button 
                  onClick={handleLogin}
                  className="w-full h-14 bg-white text-slate-950 hover:bg-slate-100 font-bold text-lg rounded-2xl gap-3 shadow-xl shadow-white/5"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continue with Google
                </Button>
                
                <div className="mt-10 pt-8 border-t border-white/5 flex items-center justify-center gap-6 opacity-40 grayscale">
                  <div className="flex flex-col items-center">
                    <Globe className="w-5 h-5 mb-1" />
                    <span className="text-[8px] font-bold uppercase tracking-widest">Global Access</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <Key className="w-5 h-5 mb-1" />
                    <span className="text-[8px] font-bold uppercase tracking-widest">Secure Auth</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <Zap className="w-5 h-5 mb-1" />
                    <span className="text-[8px] font-bold uppercase tracking-widest">Instant Sync</span>
                  </div>
                </div>
              </Card>
            </motion.div>
          ) : !analysis && !isAnalyzing ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-2xl mx-auto mt-20 text-center"
            >
              <div className="mb-8 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-bold tracking-wider uppercase">
                <Sparkles className="w-3 h-3" />
                Next-Gen Academic Intelligence
              </div>
              <h2 className="text-5xl font-serif font-bold mb-6 leading-tight">Transform your research <br/><span className="italic text-indigo-400">with precision AI</span></h2>
              <p className="text-slate-400 mb-12 text-lg max-w-xl mx-auto leading-relaxed">Upload research papers, question papers, or articles for instant deep analysis, visualization, and interactive discovery.</p>
              
              <AnimatePresence>
                {error && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3"
                  >
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <p className="text-left">{error}</p>
                    <Button variant="ghost" size="sm" onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300 hover:bg-red-500/10">Dismiss</Button>
                  </motion.div>
                )}
              </AnimatePresence>

              <Tabs value={uploadType} onValueChange={(v) => setUploadType(v as any)} className="w-full">
                <TabsList className="bg-white/5 border border-white/10 mb-8 p-1 h-12 max-w-md mx-auto">
                  <TabsTrigger value="file" className="flex-1 gap-2 data-[state=active]:bg-indigo-600 font-semibold">
                    <Upload className="w-4 h-4" />
                    Upload PDF
                  </TabsTrigger>
                  <TabsTrigger value="link" className="flex-1 gap-2 data-[state=active]:bg-indigo-600 font-semibold">
                    <Globe className="w-4 h-4" />
                    Paste Link
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="file" className="mt-0">
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className={`glass-card p-16 rounded-3xl border-2 border-dashed transition-all cursor-pointer group ${
                      error ? 'border-red-500/30 hover:border-red-500/60' : 'border-indigo-500/20 hover:border-indigo-500/50'
                    }`}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileUpload} 
                      className="hidden" 
                      accept=".pdf"
                    />
                    <div className="w-24 h-24 bg-indigo-500/5 rounded-full flex items-center justify-center mx-auto mb-8 group-hover:scale-110 transition-transform duration-500">
                      <Upload className="w-12 h-12 text-indigo-400" />
                    </div>
                    <h3 className="text-2xl font-serif font-bold mb-3">Drop your PDF here</h3>
                    <p className="text-slate-400 text-sm max-w-xs mx-auto">Supports research papers, question papers, and articles up to 20MB</p>
                  </div>
                </TabsContent>

                <TabsContent value="link" className="mt-0">
                  <div className="glass-card p-16 rounded-3xl border border-white/10">
                    <div className="w-24 h-24 bg-indigo-500/5 rounded-full flex items-center justify-center mx-auto mb-8">
                      <Globe className="w-12 h-12 text-indigo-400" />
                    </div>
                    <h3 className="text-2xl font-serif font-bold mb-6">Analyze from URL</h3>
                    <form onSubmit={handleUrlSubmit} className="flex gap-3 max-w-md mx-auto">
                      <Input 
                        placeholder="https://arxiv.org/pdf/..." 
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        className="bg-white/5 border-white/10 focus:border-indigo-500/50 h-12 px-4"
                      />
                      <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 shrink-0 h-12 px-8 font-bold">
                        Analyze
                      </Button>
                    </form>
                    <p className="text-slate-400 text-sm mt-6">Paste a link to a PDF, research article, or academic page</p>
                  </div>
                </TabsContent>
              </Tabs>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Left Column: Summary & Analysis */}
              <div className="lg:col-span-8 space-y-6">
                <Card className="glass-card border-none overflow-hidden rounded-2xl">
                  <CardHeader className="border-b border-white/5 pb-4 bg-white/5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-indigo-400" />
                        <CardTitle className="text-xl font-serif">Document Analysis</CardTitle>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="bg-indigo-500/20 text-indigo-300 border-none font-mono text-[10px]">
                          {file?.name || 'URL Source'}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Tabs defaultValue="summary" className="w-full">
                      <TabsList className="w-full justify-start bg-transparent border-b border-white/5 rounded-none h-14 px-6 gap-8">
                        <TabsTrigger value="summary" className="data-[state=active]:bg-transparent data-[state=active]:text-indigo-400 data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-indigo-400 rounded-none px-0 h-full font-bold uppercase tracking-wider text-xs">Summary</TabsTrigger>
                        <TabsTrigger value="structured" className="data-[state=active]:bg-transparent data-[state=active]:text-indigo-400 data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-indigo-400 rounded-none px-0 h-full font-bold uppercase tracking-wider text-xs">Structured Output</TabsTrigger>
                        <TabsTrigger value="humanized" className="data-[state=active]:bg-transparent data-[state=active]:text-indigo-400 data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-indigo-400 rounded-none px-0 h-full font-bold uppercase tracking-wider text-xs">ELI5 Explanation</TabsTrigger>
                      </TabsList>
                      
                      <ScrollArea className="h-[500px]">
                        <div className="p-6">
                          {isAnalyzing ? (
                            <div className="flex flex-col items-center justify-center h-[400px] space-y-4">
                              <motion.div 
                                animate={{ rotate: 360 }}
                                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full"
                              />
                              <p className="text-indigo-300 font-medium animate-pulse">Analyzing document structure...</p>
                            </div>
                          ) : (
                            <>
                              <TabsContent value="summary" className="mt-0">
                                <div className="flex items-center justify-between mb-8 bg-white/5 p-5 rounded-xl border border-white/10">
                                  <div className="flex items-center gap-6 flex-1 max-w-sm">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap">Summary Length</span>
                                    <Slider 
                                      value={[summaryLength]} 
                                      onValueChange={(v) => setSummaryLength(v[0])} 
                                      min={50} max={500} step={50}
                                      className="flex-1"
                                    />
                                  </div>
                                  <div className="flex items-center gap-2 bg-white/5 p-1 rounded-lg border border-white/5">
                                    <Button 
                                      variant={languageMode === 'Academic' ? 'default' : 'ghost'} 
                                      size="sm" 
                                      onClick={() => handleModeChange('Academic')}
                                      className={languageMode === 'Academic' ? 'bg-indigo-600 shadow-lg shadow-indigo-500/20' : 'text-slate-400'}
                                    >
                                      Academic
                                    </Button>
                                    <Button 
                                      variant={languageMode === 'Simple' ? 'default' : 'ghost'} 
                                      size="sm" 
                                      onClick={() => handleModeChange('Simple')}
                                      className={languageMode === 'Simple' ? 'bg-indigo-600 shadow-lg shadow-indigo-500/20' : 'text-slate-400'}
                                    >
                                      Simple
                                    </Button>
                                    <Button 
                                      variant={languageMode === 'ELI5' ? 'default' : 'ghost'} 
                                      size="sm" 
                                      onClick={() => handleModeChange('ELI5')}
                                      className={languageMode === 'ELI5' ? 'bg-indigo-600 shadow-lg shadow-indigo-500/20' : 'text-slate-400'}
                                    >
                                      ELI5
                                    </Button>
                                  </div>
                                </div>
                                <div className="prose prose-invert max-w-none">
                                  <p className="text-slate-200 leading-relaxed text-lg font-serif italic mb-4 opacity-50">Abstract Summary</p>
                                  <p className="text-slate-300 leading-relaxed text-lg whitespace-pre-wrap">
                                    {analysis?.summary}
                                  </p>
                                </div>
                              </TabsContent>
                              
                              <TabsContent value="structured" className="mt-0">
                                <Accordion type="single" collapsible className="w-full space-y-4">
                                  {[
                                    { id: 'objective', title: 'Research Objective', icon: Target, content: analysis?.researchObjective },
                                    { id: 'methodology', title: 'Methodology', icon: Microscope, content: analysis?.methodology },
                                    { id: 'findings', title: 'Key Findings', icon: CheckCircle2, content: analysis?.keyFindings },
                                    { id: 'evidence', title: 'Data & Evidence', icon: Info, content: analysis?.dataEvidence },
                                    { id: 'limitations', title: 'Limitations / Gaps', icon: AlertCircle, content: analysis?.limitationsGaps },
                                    { id: 'conclusion', title: 'Conclusion / Future Work', icon: GraduationCap, content: analysis?.conclusionFutureWork },
                                  ].map((section) => (
                                    <AccordionItem key={section.id} value={section.id} className="border border-white/5 rounded-2xl px-6 bg-white/5 overflow-hidden transition-all hover:bg-white/[0.07]">
                                      <AccordionTrigger className="hover:no-underline py-5">
                                        <div className="flex items-center gap-4">
                                          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                                            <section.icon className="w-5 h-5 text-indigo-400" />
                                          </div>
                                          <span className="font-serif font-bold text-lg">{section.title}</span>
                                        </div>
                                      </AccordionTrigger>
                                      <AccordionContent className="text-slate-400 leading-relaxed pb-6 text-base pl-14">
                                        {section.content}
                                      </AccordionContent>
                                    </AccordionItem>
                                  ))}
                                </Accordion>
                              </TabsContent>
                              
                              <TabsContent value="humanized" className="mt-0">
                                <div className="bg-indigo-500/10 p-8 rounded-2xl border border-indigo-500/20 relative overflow-hidden">
                                  <div className="absolute top-0 right-0 p-4">
                                    <Sparkles className="w-8 h-8 text-indigo-400/20" />
                                  </div>
                                  <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                                    <Zap className="w-5 h-5 text-yellow-400" />
                                    Humanized Explanation
                                  </h3>
                                  <p className="text-white/80 text-lg leading-relaxed italic">
                                    "{analysis?.humanizedExplanation}"
                                  </p>
                                </div>
                              </TabsContent>
                            </>
                          )}
                        </div>
                      </ScrollArea>
                    </Tabs>
                  </CardContent>
                </Card>

                {/* Bottom Section: Mind Map & Question Paper Analysis */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <MindMap keywords={analysis?.keywords || []} />
                  
                  <Card className="glass-card border-none">
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-indigo-400" />
                        Topic Distribution
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={analysis?.topicDistribution || []}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="percentage"
                              nameKey="topic"
                            >
                              {(analysis?.topicDistribution || []).map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <RechartsTooltip 
                              contentStyle={{ backgroundColor: '#1a1f3a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                              itemStyle={{ color: '#f8fafc' }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2 justify-center">
                        {analysis?.topicDistribution.map((t, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            <span className="text-[10px] text-white/60">{t.topic}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Attendance Analysis Section */}
                <AnimatePresence>
                  {analysis?.attendanceAnalysis && analysis.attendanceAnalysis.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-6"
                    >
                      <Card className="glass-card border-none">
                        <CardHeader>
                          <CardTitle className="text-sm flex items-center gap-2">
                            <UserCheck className="w-4 h-4 text-emerald-400" />
                            Student Attendance Analyzer
                          </CardTitle>
                          <CardDescription className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                            Automated Attendance Breakdown
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                          <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={analysis.attendanceAnalysis}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={60}
                                  outerRadius={90}
                                  paddingAngle={8}
                                  dataKey="percentage"
                                  nameKey="status"
                                  stroke="none"
                                >
                                  {analysis.attendanceAnalysis.map((entry, index) => (
                                    <Cell 
                                      key={`cell-${index}`} 
                                      fill={entry.status.toLowerCase().includes('present') ? '#10b981' : entry.status.toLowerCase().includes('absent') ? '#f43f5e' : '#fbbf24'} 
                                    />
                                  ))}
                                </Pie>
                                <RechartsTooltip 
                                  contentStyle={{ backgroundColor: '#020617', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', backdropFilter: 'blur(12px)' }}
                                  itemStyle={{ color: '#f8fafc', fontSize: '12px' }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="space-y-4">
                            {analysis.attendanceAnalysis.map((item, i) => (
                              <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
                                <div className="flex items-center gap-3">
                                  <div 
                                    className="w-3 h-3 rounded-full shadow-[0_0_8px_currentColor]" 
                                    style={{ color: item.status.toLowerCase().includes('present') ? '#10b981' : item.status.toLowerCase().includes('absent') ? '#f43f5e' : '#fbbf24' }} 
                                  />
                                  <span className="text-sm font-medium text-slate-200">{item.status}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-lg font-bold text-white">{item.percentage}%</span>
                                  <div className="w-12 h-1 bg-white/5 rounded-full overflow-hidden">
                                    <div 
                                      className="h-full transition-all duration-1000" 
                                      style={{ 
                                        width: `${item.percentage}%`,
                                        backgroundColor: item.status.toLowerCase().includes('present') ? '#10b981' : item.status.toLowerCase().includes('absent') ? '#f43f5e' : '#fbbf24'
                                      }} 
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                            <div className="pt-4 border-t border-white/5">
                              <p className="text-[10px] text-slate-500 italic leading-relaxed">
                                * Attendance data extracted automatically from the document structure. Percentages represent the relative distribution of student statuses.
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Right Column: Keywords, Suggestions, Chat */}
              <div className="lg:col-span-4 space-y-6">
                
                {/* Keywords */}
                <Card className="glass-card border-none rounded-2xl overflow-hidden">
                  <CardHeader className="pb-2 bg-white/5 border-b border-white/5">
                    <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                      <Key className="w-3 h-3 text-indigo-400" />
                      Extracted Keywords
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="flex flex-wrap gap-2">
                      {analysis?.keywords.map((k, i) => (
                        <div key={i}>
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge 
                                variant="outline" 
                                className="bg-indigo-500/5 border-indigo-500/20 text-indigo-300 cursor-help hover:bg-indigo-500/20 transition-all py-1.5 px-3 rounded-lg font-medium"
                              >
                                {k.word}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="bg-slate-900 border-white/10 text-slate-200 max-w-xs p-3 rounded-xl shadow-2xl">
                              <p className="text-xs leading-relaxed">{k.definition}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Related Research */}
                <Card className="glass-card border-none rounded-2xl overflow-hidden">
                  <CardHeader className="pb-2 bg-white/5 border-b border-white/5">
                    <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                      <Globe className="w-3 h-3 text-indigo-400" />
                      Smart Suggestions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 p-6">
                    {isFetchingResearch ? (
                      <div className="space-y-3">
                        {[1, 2, 3].map(i => (
                          <div key={i} className="h-24 bg-white/5 rounded-xl animate-pulse" />
                        ))}
                      </div>
                    ) : (
                      relatedResearch.map((item, i) => (
                        <div 
                          key={i} 
                          onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(item.title + ' ' + item.authors)}`, '_blank')}
                          className="p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all group cursor-pointer hover:border-indigo-500/30"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="text-sm font-serif font-bold text-slate-100 group-hover:text-indigo-400 transition-colors line-clamp-2 leading-snug">{item.title}</h4>
                            <Badge variant="outline" className="text-[9px] h-5 px-1.5 border-white/10 text-slate-500 font-mono">{item.year}</Badge>
                          </div>
                          <p className="text-xs text-slate-500 mb-3 italic">{item.authors}</p>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-indigo-400/70 uppercase tracking-wider">{item.source}</span>
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1 bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" style={{ width: `${item.relevanceScore}%` }} />
                              </div>
                              <span className="text-[10px] font-mono text-slate-500">{item.relevanceScore}%</span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                {/* Interactive Q&A Chat */}
                <Card className="glass-card border-none rounded-2xl overflow-hidden flex flex-col h-[500px]">
                  <CardHeader className="pb-2 bg-white/5 border-b border-white/5">
                    <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                      <MessageSquare className="w-3 h-3 text-indigo-400" />
                      Interactive Q&A
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 p-0 overflow-hidden flex flex-col">
                    <ScrollArea className="flex-1 p-6">
                      <div className="space-y-6">
                        {chatHistory.length === 0 && (
                          <div className="text-center py-16">
                            <div className="w-16 h-16 bg-indigo-500/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-indigo-500/10">
                              <HelpCircle className="w-8 h-8 text-indigo-400/30" />
                            </div>
                            <p className="text-sm text-slate-500 font-serif italic">Ask deep questions about the document's methodology, findings, or implications.</p>
                          </div>
                        )}
                        {chatHistory.map((msg, i) => (
                          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[90%] p-4 rounded-2xl text-sm leading-relaxed ${
                              msg.role === 'user' 
                                ? 'bg-indigo-600 text-white rounded-tr-none shadow-lg shadow-indigo-500/20 font-medium' 
                                : 'bg-white/5 text-slate-200 rounded-tl-none border border-white/5'
                            }`}>
                              {msg.parts}
                            </div>
                          </div>
                        ))}
                        {isChatting && (
                          <div className="flex justify-start">
                            <div className="bg-white/5 p-4 rounded-2xl rounded-tl-none border border-white/5">
                              <div className="flex gap-1.5">
                                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" />
                                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                              </div>
                            </div>
                          </div>
                        )}
                        <div ref={chatEndRef} />
                      </div>
                    </ScrollArea>
                    <form onSubmit={handleChat} className="p-4 bg-white/5 border-t border-white/5 flex gap-2">
                      <Input 
                        placeholder="Inquire about the research..." 
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        className="bg-white/5 border-white/10 focus:border-indigo-500/50 h-11"
                      />
                      <Button type="submit" size="icon" disabled={isChatting} className="bg-indigo-600 hover:bg-indigo-700 shrink-0 h-11 w-11 shadow-lg shadow-indigo-500/20">
                        <ChevronRight className="w-5 h-5" />
                      </Button>
                    </form>
                  </CardContent>
                </Card>

              </div>
            </div>
          )}
        </main>

        {/* History Panel */}
        <AnimatePresence>
          {isHistoryOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsHistoryOpen(false)}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
              />
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-slate-950 border-l border-white/10 z-[101] shadow-2xl flex flex-col"
              >
                <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                      <History className="w-4 h-4 text-indigo-400" />
                    </div>
                    <h2 className="text-xl font-serif font-bold">Research History</h2>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setIsHistoryOpen(false)} className="rounded-full hover:bg-white/10">
                    <ChevronRight className="w-5 h-5" />
                  </Button>
                </div>

                <ScrollArea className="flex-1">
                  <div className="p-6 space-y-4">
                    {history.length === 0 ? (
                      <div className="text-center py-20">
                        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/5">
                          <Clock className="w-8 h-8 text-slate-600" />
                        </div>
                        <p className="text-slate-500 font-serif italic">No recent research history found.</p>
                      </div>
                    ) : (
                      history.map((item) => (
                        <div 
                          key={item.id}
                          onClick={() => loadFromHistory(item)}
                          className="group p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-indigo-500/30 transition-all cursor-pointer relative"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="text-sm font-serif font-bold text-slate-200 group-hover:text-indigo-400 transition-colors line-clamp-1 pr-8">
                              {item.title}
                            </h3>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 text-slate-600 hover:text-red-400 hover:bg-red-400/10 absolute top-4 right-4"
                              onClick={(e) => deleteFromHistory(item.id, e)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(item.timestamp).toLocaleDateString()}
                            </span>
                            <Separator orientation="vertical" className="h-2 bg-white/10" />
                            <span className="text-indigo-400/70">
                              {typeof item.sourceInfo === 'string' ? 'URL' : 'PDF'}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
                
                <div className="p-6 border-t border-white/10 bg-white/5 text-center">
                  <p className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">
                    Showing last {history.length} research sessions
                  </p>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Footer Info */}
        <footer className="fixed bottom-0 left-0 right-0 z-20 bg-space-bg/90 backdrop-blur-2xl border-t border-white/5 py-4">
          <div className="container mx-auto px-6 flex items-center justify-between text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                AI Engine: Gemini 3 Flash
              </div>
              <div className="flex items-center gap-2.5">
                Difficulty Index: <span className="text-indigo-400 font-mono">{analysis?.difficultyLevel || 'N/A'}</span>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <span className="text-slate-600">© 2026 EduSense AI</span>
              <Separator orientation="vertical" className="h-3 bg-white/10" />
              <a href="#" className="hover:text-indigo-400 transition-colors">Academic Documentation</a>
            </div>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}
