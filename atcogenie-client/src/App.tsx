import { useState, useEffect, useRef } from 'react';
import type { FormEvent } from 'react';

// --- Type Definitions ---
interface ChatMessage {
  id: number;
  sessionId: number;
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
}

interface ChatSession {
  id: number;
  title: string;
  lastMessage: string; // Not in DB model directly but good for UI summary (or derived)
  model: string;
  isArchived: boolean;
  lastActiveAt?: string;
  createdAt?: string;
}

interface Model {
  id: string;
  name: string;
  quality: string;
}

interface User {
  name: string;
  role: string;
  avatar: string;
}

interface Company {
  id: number;
  name: string;
}

type Theme = 'light' | 'dark';
type SidebarTab = 'active' | 'archived';

// Extend Window for SpeechRecognition
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
    AtcoGenieCopyTable: (tableId: string) => void;
  }
}

function App() {
  // --- State ---
  const [chatHistory, setChatHistory] = useState<ChatSession[]>([]);
  const [allMessages, setAllMessages] = useState<ChatMessage[]>([]);
  const [activeTab, setActiveTab] = useState<SidebarTab>('active');

  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [currentUserInput, setCurrentUserInput] = useState('');
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [user, setUser] = useState<User>({ name: 'Loading...', role: 'User', avatar: '...' });

  // Fetch Real User
  useEffect(() => {
    fetch('/api/whoami')
      .then(res => res.json())
      .then(data => {
        if (data.isAuthenticated) {
          const fullName = data.name || "User";
          const cleanName = fullName.split('\\').pop(); // Remove domain prefix
          const initials = cleanName.split('.').map((n: string) => n[0]).join('').toUpperCase().substring(0, 2);

          setUser({
            name: cleanName.replace('.', ' '), // "ali.ahmed" -> "ali ahmed"
            role: data.hcmsEmployeeId !== "NOT FOUND" ? "Employee" : "Guest",
            avatar: initials
          });
        }
      })
      .catch(e => console.error("Auth check failed", e));
  }, []);

  // UI State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<Theme>('light');
  const [chatSearchTerm, setChatSearchTerm] = useState('');
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchResults, setSearchResults] = useState<ChatSession[]>([]);
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [activeMenuSessionId, setActiveMenuSessionId] = useState<number | null>(null);

  // Typing Animation State
  const [typingMessageId, setTypingMessageId] = useState<number | null>(null);
  const [displayedText, setDisplayedText] = useState<string>('');
  const typingIntervalRef = useRef<number | null>(null);

  // Welcome Screen State
  const [showWelcome, setShowWelcome] = useState(true);
  const [welcomeFading, setWelcomeFading] = useState(false);

  // Company Selector State
  const [isCompanySelectorOpen, setIsCompanySelectorOpen] = useState(false);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<number[]>([1, 3]);

  // Delete Confirmation Modal State
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{ isOpen: boolean, sessionId: number | null, sessionTitle: string }>({ isOpen: false, sessionId: null, sessionTitle: '' });

  // Copy Button Feedback State
  const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null);
  const [copyToast, setCopyToast] = useState<{ show: boolean; message: string }>({ show: false, message: '' });

  // Archived Chat Warning Modal
  const [showArchivedWarning, setShowArchivedWarning] = useState(false);

  // Refs
  const messageContainerRef = useRef<HTMLDivElement>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Constants
  const availableCompanies: Company[] = [
    { id: 1, name: 'Globex Corporation' },
    { id: 2, name: 'Stark Industries' },
    { id: 3, name: 'Wayne Enterprises' },
    { id: 4, name: 'Cyberdyne Systems' },
    { id: 5, name: 'Acme Corp' },
  ];

  const availableModels: Model[] = [
    { id: 'gemini-3-pro-thinking', name: 'Gemini 3 Pro (Thinking)', quality: 'Deep Analysis' },
    { id: 'gemini-3-pro-fast', name: 'Gemini 3 Pro (Fast)', quality: 'Quick Response' }
  ];

  // State for user-selected model (independent of session)
  const [selectedModelId, setSelectedModelId] = useState<string>('gemini-3-pro-fast');

  // --- Effects ---

  // Load Chats on Mount & Tab Change
  useEffect(() => {
    fetchChats();
  }, [activeTab]);

  // Load Messages when Session Changes
  useEffect(() => {
    if (selectedSessionId) {
      fetchSessionDetails(selectedSessionId);
    } else {
      setAllMessages([]);
    }
  }, [selectedSessionId]);

  useEffect(() => {
    scrollToBottom();
  }, [allMessages, selectedSessionId, isBotTyping]);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setActiveMenuSessionId(null);
      setIsModelSelectorOpen(false);
      setIsCompanySelectorOpen(false);
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // Setup Speech Recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.lang = 'en-US';
      recognition.interimResults = false;

      recognition.onstart = () => setIsRecording(true);
      recognition.onend = () => setIsRecording(false);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setCurrentUserInput(prev => prev + (prev ? ' ' : '') + transcript);
        setTimeout(autoResizeTextarea, 0);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  // --- Accessors ---
  const currentModel = availableModels.find(m => m.id === selectedModelId) || availableModels[0];

  const currentChatMessages = allMessages
    .filter(m => m.sessionId === selectedSessionId)
    .sort((a, b) => a.id - b.id); // Assuming ID order is chronological

  const filteredChatHistory = chatHistory.filter(session =>
    session.title.toLowerCase().includes(chatSearchTerm.toLowerCase())
  );

  const selectedCompaniesText = () => {
    const count = selectedCompanyIds.length;
    if (count === 0 || count === availableCompanies.length) return 'All Companies';
    if (count === 1) return availableCompanies.find(c => c.id === selectedCompanyIds[0])?.name;
    if (count === 2) return availableCompanies.filter(c => selectedCompanyIds.includes(c.id)).map(c => c.name).join(', ');
    return `${count} Companies Selected`;
  };

  // --- API Actions ---

  const fetchChats = async () => {
    try {
      const isArchived = activeTab === 'archived';
      const res = await fetch(`/api/chats?archived=${isArchived}`);
      if (res.ok) {
        const data = await res.json();
        setChatHistory(data);
        // If active session is not in list (e.g. switched tabs), deselect
        if (selectedSessionId && !data.find((c: any) => c.id === selectedSessionId)) {
          setSelectedSessionId(null);
        }
      }
    } catch (e) {
      console.error("Failed to load chats", e);
    }
  };

  const fetchSessionDetails = async (id: number) => {
    try {
      const res = await fetch(`/api/chats/${id}`);
      if (res.ok) {
        const data = await res.json();
        const mappedMessages = (data.messages || []).map((m: any) => {
          const content = m.content || m.text || "";
          return {
            id: m.id,
            sessionId: m.chatSessionId,
            sender: m.sender,
            // Format bot messages from markdown to HTML for display
            text: m.sender === 'bot' ? formatMarkdownToHtml(content) : content,
            timestamp: m.timestamp
          };
        });
        setAllMessages(mappedMessages);
      }
    } catch (e) {
      console.error("Failed to load session", e);
    }
  };

  const startNewChat = async (): Promise<number | null> => {
    try {
      const res = await fetch('/api/chats', { method: 'POST' });
      if (res.ok) {
        const newSession = await res.json();
        setActiveTab('active'); // Switch to active tab
        setChatHistory([newSession, ...chatHistory]);
        setSelectedSessionId(newSession.id);
        setAllMessages([{ id: 0, sessionId: newSession.id, sender: 'bot', text: 'How can I help you today?', timestamp: new Date().toLocaleTimeString() }]);
        return newSession.id;
      }
    } catch (e) {
      console.error("Failed to create chat", e);
    }
    return null;
  };

  // Open delete confirmation modal
  const openDeleteConfirmation = (e: React.MouseEvent, id: number, title: string) => {
    e.stopPropagation();
    setDeleteConfirmModal({ isOpen: true, sessionId: id, sessionTitle: title });
    setActiveMenuSessionId(null);
  };

  // Confirm delete after modal confirmation
  const confirmDeleteSession = async () => {
    if (!deleteConfirmModal.sessionId) return;
    try {
      await fetch(`/api/chats/${deleteConfirmModal.sessionId}`, { method: 'DELETE' });
      setChatHistory(prev => prev.filter(c => c.id !== deleteConfirmModal.sessionId));
      if (selectedSessionId === deleteConfirmModal.sessionId) setSelectedSessionId(null);
    } catch (e) { console.error("Failed to delete", e); }
    setDeleteConfirmModal({ isOpen: false, sessionId: null, sessionTitle: '' });
  };

  // Cancel delete
  const cancelDeleteSession = () => {
    setDeleteConfirmModal({ isOpen: false, sessionId: null, sessionTitle: '' });
  };

  const archiveSession = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      await fetch(`/api/chats/${id}/archive`, { method: 'PUT' });
      // Remove from current view (Active tab)
      setChatHistory(prev => prev.filter(c => c.id !== id));
      if (selectedSessionId === id) setSelectedSessionId(null);
    } catch (e) { console.error("Failed to archive", e); }
    setActiveMenuSessionId(null);
  };

  const unarchiveSession = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      await fetch(`/api/chats/${id}/unarchive`, { method: 'PUT' });
      // Remove from archived view and switch to active tab
      setChatHistory(prev => prev.filter(c => c.id !== id));
      setActiveTab('active');
      if (selectedSessionId === id) setSelectedSessionId(null);
    } catch (e) { console.error("Failed to unarchive", e); }
    setActiveMenuSessionId(null);
  };

  const renameSession = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    const session = chatHistory.find(c => c.id === id);
    if (!session) return;

    const newTitle = prompt("Rename chat:", session.title);
    if (newTitle) {
      try {
        await fetch(`/api/chats/${id}/rename?title=${encodeURIComponent(newTitle)}`, { method: 'PUT' });
        setChatHistory(prev => prev.map(c => c.id === id ? { ...c, title: newTitle } : c));
      } catch (e) { console.error("Failed to rename", e); }
    }
    setActiveMenuSessionId(null);
  };

  // Search across conversations (calls backend API)
  const handleSearch = async (query: string) => {
    setChatSearchTerm(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await fetch(`/api/chats/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setSearchResults(data);
    } catch (e) {
      console.error("Search failed", e);
    }
  };

  // Enter search mode
  const openSearchMode = () => {
    setIsSearchMode(true);
    setSelectedSessionId(null);
    setChatSearchTerm('');
    setSearchResults([]);
  };

  // Exit search mode and load a conversation
  const selectSearchResult = (sessionId: number) => {
    setIsSearchMode(false);
    setSelectedSessionId(sessionId);
    setChatSearchTerm('');
    setSearchResults([]);
  };

  // Format date for display
  const formatSearchDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // --- UI Actions ---

  const scrollToBottom = () => {
    if (messageContainerRef.current) {
      messageContainerRef.current.scrollTop = messageContainerRef.current.scrollHeight;
    }
  };

  const toggleVoiceRecording = () => {
    if (recognitionRef.current) {
      if (isRecording) {
        recognitionRef.current.stop();
      } else {
        recognitionRef.current.start();
      }
    } else {
      alert("Voice recognition not supported in this browser.");
    }
  };

  const handleModelSelect = (modelId: string) => {
    setSelectedModelId(modelId);
    setIsModelSelectorOpen(false);
  };

  // Helper: Escape HTML to prevent XSS
  const escapeHtml = (text: string): string => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  // Helper: Show copy toast notification
  const showCopyToast = (message: string) => {
    setCopyToast({ show: true, message });
    setTimeout(() => setCopyToast({ show: false, message: '' }), 2000);
  };

  // Helper: Copy text to clipboard with fallback for HTTP
  const copyToClipboard = async (text: string): Promise<boolean> => {
    // Try modern clipboard API first (requires HTTPS)
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fall through to fallback
      }
    }

    // Fallback for HTTP: use textarea + execCommand
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      textArea.style.top = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    } catch {
      return false;
    }
  };

  // Helper: Copy rich HTML to clipboard (for tables with formatting)
  const copyHtmlToClipboard = async (html: string, plainText: string): Promise<boolean> => {
    // Try ClipboardItem API for rich content (requires HTTPS)
    if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      try {
        const htmlBlob = new Blob([html], { type: 'text/html' });
        const textBlob = new Blob([plainText], { type: 'text/plain' });
        const clipboardItem = new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob
        });
        await navigator.clipboard.write([clipboardItem]);
        return true;
      } catch {
        // Fall through to fallback
      }
    }

    // Fallback: Use a temporary editable div for rich copy
    try {
      const container = document.createElement('div');
      container.innerHTML = html;
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.top = '-9999px';
      container.setAttribute('contenteditable', 'true');
      document.body.appendChild(container);

      const range = document.createRange();
      range.selectNodeContents(container);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      const successful = document.execCommand('copy');

      selection?.removeAllRanges();
      document.body.removeChild(container);
      return successful;
    } catch {
      // Last resort: plain text
      return copyToClipboard(plainText);
    }
  };

  // Helper: Copy message to clipboard (with HTML formatting)
  const copyMessageToClipboard = async (messageId: number, text: string) => {
    // Get plain text version
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    const plainText = tempDiv.innerText || tempDiv.textContent || '';

    // Copy as rich HTML to preserve formatting
    const success = await copyHtmlToClipboard(text, plainText);
    if (success) {
      setCopiedMessageId(messageId);
      showCopyToast('Copied to clipboard!');
      setTimeout(() => setCopiedMessageId(null), 2000);
    } else {
      showCopyToast('Failed to copy');
    }
  };

  // Helper: Copy table by ID (invoked from inline HTML button)
  const copyTableById = async (tableId: string) => {
    const table = document.getElementById(tableId) as HTMLTableElement;
    if (!table) return;

    // Create styled HTML table for rich copy
    const styledTable = table.cloneNode(true) as HTMLTableElement;
    styledTable.style.borderCollapse = 'collapse';
    styledTable.style.border = '1px solid #ccc';
    styledTable.querySelectorAll('th, td').forEach(cell => {
      (cell as HTMLElement).style.border = '1px solid #ccc';
      (cell as HTMLElement).style.padding = '8px';
    });
    styledTable.querySelectorAll('th').forEach(th => {
      (th as HTMLElement).style.backgroundColor = '#f5f5f5';
      (th as HTMLElement).style.fontWeight = 'bold';
    });

    // Create plain text version (tab-separated for Excel)
    const rows = table.querySelectorAll('tr');
    const formattedRows: string[] = [];
    rows.forEach(row => {
      const cells = row.querySelectorAll('th, td');
      const cellTexts: string[] = [];
      cells.forEach(cell => {
        cellTexts.push((cell.textContent || '').trim());
      });
      formattedRows.push(cellTexts.join('\t'));
    });
    const plainText = formattedRows.join('\n');

    // Copy as rich HTML
    const success = await copyHtmlToClipboard(styledTable.outerHTML, plainText);
    if (success) {
      showCopyToast('Table copied to clipboard!');
    } else {
      showCopyToast('Failed to copy table');
    }
  };

  // Register global function for inline copy buttons
  useEffect(() => {
    window.AtcoGenieCopyTable = copyTableById;
    return () => {
      // @ts-ignore
      delete window.AtcoGenieCopyTable;
    };
  }, []);

  // Helper: Convert Markdown table to HTML (simplified - no complex inline JS)
  const parseMarkdownTable = (tableText: string): string => {
    const lines = tableText.trim().split('\n');
    if (lines.length < 2) return escapeHtml(tableText);

    const headerCells = lines[0].split('|').map(cell => cell.trim()).filter(Boolean);
    const rows = lines.slice(2).filter(line => line.includes('|'));

    // Generate unique ID for this table
    const tableId = 'table-' + Math.random().toString(36).substr(2, 9);

    let tableHtml = `
      <div class="my-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
        <div class="flex justify-end p-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
          <button onclick="window.AtcoGenieCopyTable('${tableId}')" class="text-xs flex items-center gap-1 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            Copy Table
          </button>
        </div>
        <div class="overflow-x-auto">
          <table id="${tableId}" class="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
            <thead class="bg-slate-100 dark:bg-slate-800">
              <tr>
                ${headerCells.map(cell => `<th class="px-4 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">${escapeHtml(cell)}</th>`).join('')}
              </tr>
            </thead>
            <tbody class="bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
              ${rows.map(row => {
      const cells = row.split('|').map(cell => cell.trim()).filter(Boolean);
      return `<tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  ${cells.map(cell => `<td class="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">${escapeHtml(cell)}</td>`).join('')}
                </tr>`;
    }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    return tableHtml;
  };

  // Helper: Convert Markdown to HTML
  const formatMarkdownToHtml = (markdown: string): string => {
    if (!markdown) return '';
    let html = markdown;

    // Markdown Tables - detect and convert BEFORE other processing
    const tableRegex = /(\|[^\n]+\|\n\|[\s:|-]+\|\n(?:\|[^\n]+\|\n?)+)/g;
    html = html.replace(tableRegex, (match) => parseMarkdownTable(match));

    // Code blocks (```language\ncode\n```) - simplified without onclick
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
      return `
        <div class="my-3 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
          <div class="bg-slate-100 dark:bg-slate-800 px-3 py-1.5 border-b border-slate-200 dark:border-slate-700">
            <span class="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">${lang || 'code'}</span>
          </div>
          <div class="bg-slate-50 dark:bg-slate-900 p-3 overflow-x-auto">
            <pre class="text-sm"><code class="language-${lang || 'text'} whitespace-pre">${escapeHtml(code.trim())}</code></pre>
          </div>
        </div>`;
    });

    // Headers (### Header)
    html = html.replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold text-slate-800 dark:text-slate-200 mt-4 mb-2">$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold text-slate-800 dark:text-slate-200 mt-4 mb-2">$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-slate-800 dark:text-slate-200 mt-4 mb-3">$1</h1>');

    // Inline code (`code`)
    html = html.replace(/`([^`]+)`/g, '<code class="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-sm text-pink-600 dark:text-pink-400">$1</code>');

    // Bold (**text** or __text__)
    html = html.replace(/\*\*([^\*]+)\*\*/g, '<strong class="font-semibold text-slate-800 dark:text-slate-200">$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong class="font-semibold text-slate-800 dark:text-slate-200">$1</strong>');

    // Italic (*text*) - be careful not to match table separators or bullet points
    html = html.replace(/(?<![|\-\*])\*([^\*\n]+)\*(?![|\-])/g, '<em>$1</em>');

    // Bullet lists
    html = html.replace(/^\* (.+)$/gm, '<li class="ml-4 list-disc text-slate-700 dark:text-slate-300">$1</li>');
    html = html.replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-slate-700 dark:text-slate-300">$1</li>');

    // Numbered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-slate-700 dark:text-slate-300">$1</li>');

    // Line breaks (preserve structure)
    html = html.replace(/\n\n/g, '<br><br>');
    html = html.replace(/(?<!>)\n(?!<)/g, '<br>');

    return html;
  };


  const toggleCompanySelection = (id: number) => {
    if (selectedCompanyIds.includes(id)) {
      setSelectedCompanyIds(selectedCompanyIds.filter(cId => cId !== id));
    } else {
      setSelectedCompanyIds([...selectedCompanyIds, id]);
    }
  };

  // Typing Animation Function
  const startTypingAnimation = (messageId: number, fullText: string) => {
    // Clear any existing animation
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
    }

    setTypingMessageId(messageId);
    setDisplayedText('');

    let currentIndex = 0;
    const typingSpeed = 15; // milliseconds per character (adjust for speed)

    typingIntervalRef.current = setInterval(() => {
      if (currentIndex < fullText.length) {
        setDisplayedText(fullText.substring(0, currentIndex + 1));
        currentIndex++;
        // Auto-scroll while typing
        scrollToBottom();
      } else {
        // Animation complete
        if (typingIntervalRef.current) {
          clearInterval(typingIntervalRef.current);
          typingIntervalRef.current = null;
        }
        setTypingMessageId(null);
        setDisplayedText('');
        scrollToBottom();
      }
    }, typingSpeed);
  };

  // Stop generation function
  const stopGeneration = () => {
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
    setTypingMessageId(null);
    setDisplayedText('');
    setIsBotTyping(false);
  };

  // Cleanup typing animation on unmount
  useEffect(() => {
    return () => {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
      }
    };
  }, []);


  const sendMessage = async (e?: FormEvent) => {
    e?.preventDefault();
    console.log("sendMessage called", { input: currentUserInput, sessionId: selectedSessionId });

    // Check if current chat is archived
    const currentSession = chatHistory.find(c => c.id === selectedSessionId);
    if (currentSession?.isArchived) {
      setShowArchivedWarning(true);
      return;
    }

    const messageText = currentUserInput.trim();
    if (!messageText) {
      console.log("Message text empty, returning");
      return;
    }

    // Local variable to ensure we have an ID for this run
    let currentSessionId = selectedSessionId;

    if (currentSessionId === null) {
      console.log("No session ID, creating new chat...");
      // If no session, create one first and wait for ID
      const newId = await startNewChat();
      console.log("New chat created with ID:", newId);
      if (newId === null) return; // Creation failed
      currentSessionId = newId;
    }

    // Optimistic UI Update
    const tempId = Date.now();
    const newMessage: ChatMessage = {
      id: tempId,
      sessionId: currentSessionId,
      sender: 'user',
      text: messageText,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    };

    setAllMessages(prev => [...prev, newMessage]);
    setCurrentUserInput('');
    setIsBotTyping(true);

    if (promptTextareaRef.current) promptTextareaRef.current.style.height = 'auto';

    // Note: User message persistence is handled by backend in GenieQueryService

    // --- 2. Get Bot Response (AI Query API with session context) ---
    try {
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: messageText,
          sessionId: currentSessionId // Use local variable
        })
      });

      const data = await response.json();
      let botText = "I'm sorry, I couldn't process that.";

      if (data.success) {
        // Use the formatted message from AI if available
        if (data.message) {
          // Convert markdown to HTML for display
          botText = formatMarkdownToHtml(data.message);
        } else if (data.data?.rows && data.data.rows.length > 0) {
          // Display data as table if rows are returned
          botText = `
                      <p class="mb-2 text-slate-600 dark:text-slate-300">Here is the data for <strong>${messageText}</strong>:</p>
                      <div class="relative group">
                          <button onclick="const table = this.nextElementSibling.querySelector('table'); const rows = Array.from(table.rows).map(row => Array.from(row.cells).map(cell => cell.innerText).join('\\t')).join('\\n'); navigator.clipboard.writeText(rows).then(() => { this.innerText = 'Copied!'; setTimeout(() => this.innerText = 'Copy Table', 2000); });" 
                                  class="absolute right-0 -top-8 bg-white dark:bg-slate-800 text-[10px] px-2 py-1 rounded border border-slate-200 dark:border-slate-700 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 z-10 cursor-pointer">
                            Copy Table
                          </button>
                          <div class="overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-700">
                            <table class="min-w-full text-left text-sm">
                              <thead class="bg-slate-50 dark:bg-slate-800">
                                <tr>
                                  ${Object.keys(data.data.rows[0]).map(key => `<th class="p-3 font-semibold text-slate-700 dark:text-slate-300 capitalize">${key}</th>`).join('')}
                                </tr>
                              </thead>
                              <tbody class="bg-white dark:bg-slate-800/50">
                                ${data.data.rows.map((row: any) => `
                                  <tr>
                                      ${Object.values(row).map(val => `<td class="p-3 border-t border-slate-100 dark:border-slate-700">${val}</td>`).join('')}
                                  </tr>
                                `).join('')}
                              </tbody>
                            </table>
                          </div>
                      </div>
                  `;
        } else if (data.data?.generatedSql) {
          // Show generated SQL in a code block
          botText = `<div class="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg"><pre class="text-sm overflow-x-auto"><code class="language-sql">${escapeHtml(data.data.generatedSql)}</code></pre></div>`;
        } else {
          botText = data.message || "Query processed successfully.";
        }
      } else {
        botText = `<div class="text-red-600 dark:text-red-400">Error: ${data.error || 'Unknown error occurred'}</div>`;
      }

      // Note: Bot message persistence is handled by backend in GenieQueryService

      // Update UI with Bot Message
      const botResponse: ChatMessage = {
        id: tempId + 1,
        sessionId: currentSessionId,
        sender: 'bot',
        text: botText,
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      };
      setAllMessages(prev => [...prev, botResponse]);

      // Start typing animation for the bot response
      startTypingAnimation(botResponse.id, botText);

    } catch (err) {
      setAllMessages(prev => [...prev, {
        id: tempId + 2,
        sessionId: currentSessionId,
        sender: 'bot',
        text: "Error connecting to server. Please try again.",
        timestamp: new Date()
      } as any]);
    } finally {
      setIsBotTyping(false);
      // Refresh chat list to get updated title from backend
      fetchChats();
    }
  };

  const autoResizeTextarea = () => {
    if (promptTextareaRef.current) {
      promptTextareaRef.current.style.height = 'auto';
      promptTextareaRef.current.style.height = `${Math.min(promptTextareaRef.current.scrollHeight, 200)}px`;
    }
  };

  // Handle welcome screen dismissal
  const dismissWelcome = () => {
    if (showWelcome && !welcomeFading) {
      setWelcomeFading(true);
      setTimeout(() => {
        setShowWelcome(false);
      }, 2000); // Slower fade - 2 seconds
    }
  };

  return (
    <div
      className="flex h-screen font-sans text-slate-800 dark:text-slate-300 bg-white dark:bg-slate-900 overflow-hidden"
      onMouseMove={dismissWelcome}
      onTouchStart={dismissWelcome}
    >
      {/* Welcome Landing Screen - Light Theme, Minimal Blue */}
      {showWelcome && (
        <div
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-white transition-all ease-out ${welcomeFading ? 'opacity-0 duration-[2000ms]' : 'opacity-100 duration-300'
            }`}
        >
          {/* Grid Background */}
          <div className="absolute inset-0 overflow-hidden">
            {/* Subtle grid pattern */}
            <div
              className="absolute inset-0 opacity-[0.4]"
              style={{
                backgroundImage: `linear-gradient(rgba(226, 232, 240, 1) 1px, transparent 1px),
                                  linear-gradient(90deg, rgba(226, 232, 240, 1) 1px, transparent 1px)`,
                backgroundSize: '80px 80px'
              }}
            ></div>

            {/* Horizontal accent line */}
            <div
              className="absolute left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-blue-400/30 to-transparent"
              style={{ top: '35%' }}
            ></div>
            <div
              className="absolute left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-blue-300/20 to-transparent"
              style={{ top: '65%' }}
            ></div>
          </div>

          {/* Small Wandering Blue Genie */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
            <div className="absolute top-1/3 left-1/3 wandering-genie">
              <img
                src="/blue-genie.png"
                alt="Wandering Genie"
                className="w-14 h-auto opacity-90"
              />
            </div>
          </div>

          {/* Floating Data Nodes - Left Side */}
          <div className={`absolute left-[12%] top-1/2 -translate-y-1/2 transition-all ease-out ${welcomeFading ? 'opacity-0 -translate-x-10 duration-[1500ms]' : 'opacity-100 translate-x-0 duration-500'
            }`}>
            <div className="flex flex-col gap-3">
              {[35, 55, 40, 70, 50].map((height, i) => (
                <div key={i} className="flex items-end gap-1.5">
                  <div
                    className="w-1.5 bg-gradient-to-t from-blue-500 to-blue-300 rounded-full opacity-60"
                    style={{
                      height: `${height}px`,
                    }}
                  ></div>
                  <div
                    className="w-1.5 bg-gradient-to-t from-blue-400 to-blue-200 rounded-full opacity-40"
                    style={{
                      height: `${height * 0.5}px`,
                    }}
                  ></div>
                </div>
              ))}
            </div>
          </div>

          {/* Floating Data Nodes - Right Side */}
          <div className={`absolute right-[12%] top-1/2 -translate-y-1/2 transition-all ease-out ${welcomeFading ? 'opacity-0 translate-x-10 duration-[1500ms]' : 'opacity-100 translate-x-0 duration-500'
            }`}>
            <div className="flex flex-col gap-4">
              {[0.4, 0.7, 0.5, 0.85, 0.6].map((width, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div
                    className="h-[2px] bg-gradient-to-r from-blue-400 to-blue-200 rounded-full"
                    style={{
                      width: `${width * 70}px`,
                      opacity: 0.5
                    }}
                  ></div>
                  <div className="w-2 h-2 rounded-full bg-blue-500 opacity-50"></div>
                </div>
              ))}
            </div>
          </div>

          {/* Center Content */}
          <div className="relative z-10 flex flex-col items-center">
            {/* Minimal Logo Mark */}
            <div className={`mb-14 transition-all ease-out ${welcomeFading ? 'opacity-0 scale-95 duration-[1200ms]' : 'opacity-100 scale-100 duration-500 delay-100'
              }`}>
              <div className="relative">
                {/* Animated outer ring */}
                <div className="absolute inset-0 w-24 h-24 rounded-full border-2 border-blue-200 animate-ping opacity-20" style={{ animationDuration: '3s' }}></div>
                {/* Outer ring with pulse */}
                <div className="w-24 h-24 rounded-full border-2 border-blue-200 flex items-center justify-center animate-pulse" style={{ animationDuration: '2s' }}>
                  {/* Inner circle */}
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-50 to-white flex items-center justify-center shadow-sm">
                    {/* Core with glow */}
                    <div className="w-4 h-4 rounded-full bg-blue-500 shadow-lg shadow-blue-500/40 animate-pulse" style={{ animationDuration: '1.5s' }}></div>
                  </div>
                </div>
                {/* Orbiting dot */}
                <div
                  className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-blue-400 animate-spin shadow-sm shadow-blue-400/50"
                  style={{ animationDuration: '10s', transformOrigin: '0 48px' }}
                ></div>
              </div>
            </div>

            {/* Greeting - Clean & Minimal */}
            <div className={`text-center transition-all ease-out ${welcomeFading ? 'opacity-0 translate-y-4 duration-[1500ms]' : 'opacity-100 translate-y-0 duration-500 delay-200'
              }`}>
              <p className="text-slate-400 text-xs uppercase tracking-[0.3em] mb-3 font-medium">Welcome</p>
              <h1 className="text-4xl md:text-5xl font-light text-slate-800 tracking-tight">
                Hello, <span className="font-medium text-blue-600">{user.name.split(' ')[0]}</span>
              </h1>
            </div>

            {/* Subtle Analytics Tagline */}
            <div className={`mt-14 transition-all ease-out ${welcomeFading ? 'opacity-0 translate-y-4 duration-[1800ms]' : 'opacity-100 translate-y-0 duration-500 delay-300'
              }`}>
              <div className="flex items-center gap-4 text-slate-400">
                <div className="w-10 h-[1px] bg-gradient-to-r from-transparent to-slate-300"></div>
                <span className="text-[11px] uppercase tracking-[0.15em] font-medium">Your Data, Conversational</span>
                <div className="w-10 h-[1px] bg-gradient-to-l from-transparent to-slate-300"></div>
              </div>
            </div>
          </div>

          {/* Bottom Hint - Enhanced */}
          <div className={`absolute bottom-10 transition-all ease-out ${welcomeFading ? 'opacity-0 translate-y-4 duration-[1000ms]' : 'opacity-100 translate-y-0 duration-500 delay-500'
            }`}>
            <div className="flex flex-col items-center gap-3">
              {/* Animated cursor icon */}
              <div className="relative">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-blue-400 animate-bounce"
                  style={{ animationDuration: '2s' }}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
                {/* Ripple effect */}
                <div className="absolute inset-0 rounded-full border border-blue-300 animate-ping opacity-30" style={{ animationDuration: '2s' }}></div>
              </div>
              <p className="text-slate-400 text-[11px] uppercase tracking-[0.15em] font-medium">Move to continue</p>
            </div>
          </div>
        </div>
      )}
      {/* Sidebar */}
      <aside className={`flex-shrink-0 bg-slate-50 dark:bg-slate-900 flex flex-col transition-all duration-300 ease-in-out border-r border-slate-200 dark:border-slate-800 ${isSidebarOpen ? 'w-[280px]' : 'w-0 opacity-0 pointer-events-none'}`}>
        <header className="p-4 flex items-center justify-center">
          {/* Light mode logo */}
          <img src="/genie-logo.png" alt="ATCO Genie" className="h-16 object-contain dark:hidden" />
          {/* Dark mode logo */}
          <img src="/ChatGPT Image Jan 29, 2026, 09_48_19 AM.png" alt="ATCO Genie" className="h-16 object-contain hidden dark:block" />
        </header>

        {/* Company Selector */}
        <div className="px-4 pb-2">
          <div className="relative">
            <button onClick={(e) => { e.stopPropagation(); setIsCompanySelectorOpen(!isCompanySelectorOpen); }} className="w-full flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-400 transition-colors">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{selectedCompaniesText()}</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {isCompanySelectorOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                {availableCompanies.map(company => (
                  <div key={company.id} onClick={(e) => { e.stopPropagation(); toggleCompanySelection(company.id); }} className="flex items-center gap-2 p-2 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer">
                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${selectedCompanyIds.includes(company.id) ? 'bg-blue-600 border-blue-600' : 'border-slate-300 dark:border-slate-600'}`}>
                      {selectedCompanyIds.includes(company.id) && <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                    </div>
                    <span className="text-sm text-slate-700 dark:text-slate-300">{company.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="px-4 pb-2 pt-2 flex gap-2">
          <button
            onClick={() => setActiveTab('active')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === 'active' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
          >
            Chats
          </button>
          <button
            onClick={() => setActiveTab('archived')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === 'archived' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
          >
            Archived
          </button>
        </div>

        <div className="px-4 pb-4">
          <button onClick={startNewChat} className="w-full flex items-center gap-3 p-3 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
            <span className="text-xl leading-none font-light">+</span>
            New Chat
          </button>
        </div>

        {/* Chat History */}
        <nav className="flex-1 flex flex-col overflow-y-auto px-2">
          <div className="px-2 pb-2">
            <input
              type="text"
              placeholder="Search conversations..."
              onFocus={openSearchMode}
              readOnly
              className="w-full bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-300 placeholder-slate-400 cursor-pointer hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors"
            />
            <p className="mb-2 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{activeTab === 'active' ? 'Recent' : 'Archived'}</p>
            {filteredChatHistory.map(session => (
              <div key={session.id} className="relative group">
                <button onClick={() => { setSelectedSessionId(session.id); setIsSearchMode(false); }}
                  className={`w-full text-left py-2 px-3 rounded-lg flex items-center gap-3 mb-1 text-sm transition-colors pr-8 ${session.id === selectedSessionId ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400'}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 opacity-50 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                  <span className="truncate">{session.title}</span>
                </button>

                {/* 3-Dots Menu Trigger - Show for all chats */}
                <button
                  onClick={(e) => { e.stopPropagation(); setActiveMenuSessionId(activeMenuSessionId === session.id ? null : session.id); }}
                  className={`absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity ${activeMenuSessionId === session.id ? 'opacity-100 bg-slate-200 dark:bg-slate-700' : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400'}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
                </button>

                {/* Dropdown Menu */}
                {activeMenuSessionId === session.id && (
                  <div className="absolute right-0 top-full mt-1 w-32 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-20 py-1 overflow-hidden" style={{ top: '80%' }}>
                    <button onClick={(e) => renameSession(e, session.id)} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      Rename
                    </button>
                    {activeTab === 'active' ? (
                      <button onClick={(e) => archiveSession(e, session.id)} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                        Archive
                      </button>
                    ) : (
                      <button onClick={(e) => unarchiveSession(e, session.id)} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                        Unarchive
                      </button>
                    )}
                    <button onClick={(e) => openDeleteConfirmation(e, session.id, session.title)} className="w-full text-left px-3 py-2 text-xs hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </nav>

        {/* Footer */}
        <footer className="p-4 border-t border-slate-100 dark:border-slate-800">
          <button className="flex items-center gap-3 w-full hover:bg-slate-100 dark:hover:bg-slate-800 p-2 rounded-lg transition-colors text-left">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-fuchsia-600 to-purple-600 flex items-center justify-center font-bold text-white text-xs">{user.avatar}</div>
            <div className="flex-1 overflow-hidden">
              <h4 className="font-medium text-sm text-slate-700 dark:text-slate-200 truncate">{user.name}</h4>
              <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{user.role}</p>
            </div>
          </button>
        </footer>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-slate-900">
        {/* Top Bar (Mobile/Minimal) */}
        <header className="flex-shrink-0 flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur z-10">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <button onClick={() => startNewChat()} className="text-lg font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
              ATCO Genie
            </button>
          </div>

          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
            {theme === 'dark' ? '🌙' : '☀️'}
          </button>
        </header>

        {/* Chat Area */}
        <main className="flex-1 flex flex-col overflow-hidden relative w-full max-w-5xl mx-auto">
          <div ref={messageContainerRef} className="flex-1 overflow-y-auto px-4 py-6 scroll-smooth">

            {/* Search Mode Panel - Gemini Style */}
            {isSearchMode ? (
              <div className="flex flex-col h-full">
                {/* Search Header */}
                <div className="flex items-center gap-4 mb-6">
                  <button
                    onClick={() => setIsSearchMode(false)}
                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                  </button>
                  <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Search</h1>
                </div>

                {/* Search Input */}
                <div className="mb-6">
                  <div className="relative">
                    <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search for chats"
                      value={chatSearchTerm}
                      onChange={(e) => handleSearch(e.target.value)}
                      autoFocus
                      className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-full pl-12 pr-4 py-3 text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                {/* Search Results */}
                <div className="flex-1 overflow-y-auto">
                  <p className="text-sm font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
                    {chatSearchTerm ? `Results for "${chatSearchTerm}"` : 'Recent'}
                  </p>

                  {(chatSearchTerm ? searchResults : chatHistory).length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      {chatSearchTerm ? 'No matching conversations found' : 'No conversations yet'}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {(chatSearchTerm ? searchResults : chatHistory).map(session => (
                        <button
                          key={session.id}
                          onClick={() => selectSearchResult(session.id)}
                          className="w-full flex items-center justify-between p-4 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left group"
                        >
                          <span className="text-slate-700 dark:text-slate-300 truncate pr-4 flex-1">
                            {session.title}
                          </span>
                          <span className="text-sm text-slate-400 dark:text-slate-500 whitespace-nowrap">
                            {formatSearchDate(session.lastActiveAt || session.createdAt || new Date().toISOString())}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Welcome Message for New/Empty Chats */
              currentChatMessages.length === 0 && !isBotTyping && (
                <div className="flex flex-col items-center justify-center h-full text-center relative">
                  {/* Large Floating Genie Silhouette - Full Screen Effect */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden pt-20">
                    {/* Light mode genie */}
                    <img
                      src="/genie-character.png"
                      alt="ATCO Genie"
                      className="w-[400px] h-auto floating-genie opacity-20 dark:hidden"
                    />
                    {/* Dark mode genie */}
                    <img
                      src="/dark mode-removedbg.png"
                      alt="ATCO Genie"
                      className="w-[400px] h-auto floating-genie opacity-20 hidden dark:block"
                    />
                  </div>

                  {/* Content on top of background genie */}
                  <div className="relative z-10 flex flex-col items-center">
                    <h2 className="text-3xl font-bold text-black dark:text-white mb-3">
                      How can I help you today?
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 max-w-lg text-lg">
                      I'm your AI assistant for ATCO data. Ask me anything about employees, financials, reports, or analytics.
                    </p>

                    {/* Suggestion Chips */}
                    <div className="flex flex-wrap gap-2 mt-6 justify-center max-w-xl">
                      <button
                        onClick={() => setCurrentUserInput("Show me the employee count by department")}
                        className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full text-sm hover:bg-blue-500 hover:text-white transition-colors"
                      >
                        📊 Employee count by department
                      </button>
                      <button
                        onClick={() => setCurrentUserInput("What are the top 5 highest paid employees?")}
                        className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full text-sm hover:bg-blue-500 hover:text-white transition-colors"
                      >
                        💰 Top 5 highest paid
                      </button>
                      <button
                        onClick={() => setCurrentUserInput("Generate a summary report for this month")}
                        className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full text-sm hover:bg-blue-500 hover:text-white transition-colors"
                      >
                        📝 Monthly summary
                      </button>
                    </div>
                  </div>
                </div>
              )
            )}

            {!isSearchMode && currentChatMessages.map(message => (
              <div key={message.id} className={`flex gap-4 mb-6 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                {message.sender === 'bot' && (
                  <div className="w-8 h-8 rounded-full bg-white border border-slate-100 flex items-center justify-center flex-shrink-0 shadow-sm overflow-hidden p-1">
                    <img src="/genie-character-removedbg.png" alt="Genie" className="w-full h-full object-contain" />
                  </div>
                )}
                <div className={`max-w-2xl relative group ${message.sender === 'user' ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-2xl rounded-tr-sm px-5 py-3' : 'text-slate-700 dark:text-slate-300 px-1 py-1'}`}>
                  {message.sender === 'user' ? (
                    <p className="whitespace-pre-wrap">{message.text}</p>
                  ) : (
                    <>
                      <div className="prose prose-sm max-w-none prose-slate dark:prose-invert"
                        dangerouslySetInnerHTML={{
                          __html: typingMessageId === message.id ? displayedText : message.text
                        }} />
                      {typingMessageId === message.id && (
                        <span className="inline-block w-1 h-4 bg-blue-500 ml-1 animate-pulse"></span>
                      )}
                      {/* Copy Response Button - Below content */}
                      <div className="flex justify-start mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => copyMessageToClipboard(message.id, message.text)}
                          className={`p-2 rounded-lg shadow-sm border transition-all ${copiedMessageId === message.id
                            ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-200 dark:border-green-700'
                            : 'bg-white dark:bg-slate-800 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 border-slate-200 dark:border-slate-700'
                            }`}
                          title="Copy Response"
                        >
                          {copiedMessageId === message.id ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
            {isBotTyping && (
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-white border border-slate-100 flex items-center justify-center flex-shrink-0 animate-pulse overflow-hidden p-1">
                  <img src="/genie-character-removedbg.png" alt="Typing..." className="w-full h-full object-contain" />
                </div>
                <div className="flex items-center gap-1 py-3 px-4 rounded-2xl bg-slate-100 dark:bg-slate-800">
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="px-4 pb-6 pt-2 w-full">
            <form onSubmit={sendMessage} className="relative bg-slate-50 dark:bg-slate-800/50 border border-black dark:border-slate-400 rounded-2xl p-3 shadow-sm focus-within:ring-2 focus-within:ring-blue-100 dark:focus-within:ring-blue-900/30 transition-all">

              {/* Top: Textarea (Borderless) */}
              <textarea ref={promptTextareaRef}
                value={currentUserInput} onChange={e => { setCurrentUserInput(e.target.value); autoResizeTextarea(); }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Ask anything, or use the mic to speak..."
                className="w-full bg-transparent border-none outline-none focus:ring-0 p-2 text-slate-800 dark:text-slate-200 placeholder-slate-400 resize-none min-h-[44px] max-h-[200px]"
                rows={1}
              />

              {/* Bottom Toolbar */}
              <div className="flex items-center justify-between mt-2 pt-1 border-t border-transparent">
                <div className="flex items-center gap-2">
                  {/* Add File Button */}
                  <input type="file" ref={fileInputRef} className="hidden" />
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors" title="Add file">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  </button>

                  {/* Model Selector */}
                  <div className="relative">
                    <button type="button" onClick={(e) => { e.stopPropagation(); setIsModelSelectorOpen(!isModelSelectorOpen); setIsCompanySelectorOpen(false); }} className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 transition-colors">
                      {currentModel.name}
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {isModelSelectorOpen && (
                      <div onClick={(e) => e.stopPropagation()} className="absolute bottom-full mb-2 left-0 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-20 py-1 overflow-hidden">
                        {availableModels.map(model => (
                          <button key={model.id} type="button" onClick={() => handleModelSelect(model.id)} className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 ${currentModel.id === model.id ? 'text-blue-600 font-medium' : 'text-slate-700 dark:text-slate-300'}`}>
                            {model.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Voice Input */}
                  <button type="button" onClick={toggleVoiceRecording} disabled={isBotTyping || typingMessageId !== null} className={`p-2 rounded-full transition-colors ${isRecording ? 'bg-red-100 text-red-600 animate-pulse' : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500'} ${(isBotTyping || typingMessageId !== null) ? 'opacity-50 cursor-not-allowed' : ''}`} title="Use Microphone">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                  </button>

                  {/* Stop Generation Button - visible during typing */}
                  {(isBotTyping || typingMessageId !== null) && (
                    <button
                      type="button"
                      onClick={stopGeneration}
                      className="p-2 rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors shadow-sm flex items-center gap-1"
                      title="Stop generating"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="6" width="12" height="12" rx="2" />
                      </svg>
                    </button>
                  )}

                  {/* Send Button - disabled during generation */}
                  <button
                    type="submit"
                    disabled={!currentUserInput || isBotTyping || typingMessageId !== null}
                    className="p-2 rounded-full bg-blue-600 text-white disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors shadow-sm"
                    title={isBotTyping || typingMessageId !== null ? "Wait for response to complete" : "Send message"}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg>
                  </button>
                </div>
              </div>
            </form>
            <div className="text-center mt-2">
              <p className="text-xs text-slate-400 dark:text-slate-500">Gemini can make mistakes. Consider checking important information.</p>
            </div>
          </div>
        </main>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4 transform transition-all">
            {/* Warning Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>

            {/* Title */}
            <h3 className="text-xl font-semibold text-center text-slate-800 dark:text-slate-200 mb-2">
              Delete Chat?
            </h3>

            {/* Message */}
            <p className="text-center text-slate-600 dark:text-slate-400 mb-6">
              Are you sure you want to delete "<span className="font-medium text-slate-800 dark:text-slate-200">{deleteConfirmModal.sessionTitle}</span>"? This action cannot be undone.
            </p>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={cancelDeleteSession}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteSession}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white transition-colors font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archived Chat Warning Modal */}
      {showArchivedWarning && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-sm w-full p-6">
            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">Chat is Archived</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Unarchive the chat to continue chatting
              </p>
            </div>
            <button
              onClick={() => setShowArchivedWarning(false)}
              className="w-full px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors font-medium"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Copy Toast Notification */}
      {copyToast.show && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-slate-900 dark:bg-slate-700 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-medium">{copyToast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
