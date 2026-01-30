
import { Component, ChangeDetectionStrategy, signal, computed, WritableSignal, effect, ViewChild, ElementRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

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
  lastMessage: string;
  model: string;
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

// Extend the Window interface for the SpeechRecognition API
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, FormsModule],
  host: {
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class AppComponent implements OnInit {
  // --- View Children ---
  @ViewChild('messageContainer') private messageContainer!: ElementRef;
  @ViewChild('promptTextarea') private promptTextarea!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('modelSelectorContainer') private modelSelectorContainer!: ElementRef;
  @ViewChild('companySelectorContainer') private companySelectorContainer!: ElementRef;
  @ViewChild('fileInput') private fileInput!: ElementRef<HTMLInputElement>;
  
  // --- State Signals ---
  chatHistory: WritableSignal<ChatSession[]> = signal([
    { id: 1, title: 'Q2 Sales Performance', lastMessage: 'Can you break that down by region?', model: 'gemini-3-pro' },
    { id: 2, title: 'Customer Feedback Analysis', lastMessage: 'That sounds like a great plan.', model: 'gemini-2.5-flash' },
  ]);

  allMessages: WritableSignal<ChatMessage[]> = signal([
    { id: 1, sessionId: 1, sender: 'bot', text: 'Welcome. Ready to dive into the Q2 sales performance data?', timestamp: '11:30 AM' },
    { id: 2, sessionId: 1, sender: 'user', text: 'Yes, show me the total revenue compared to Q1.', timestamp: '11:31 AM' },
    { id: 3, sessionId: 2, sender: 'bot', text: 'Hello! How can I help you analyze your customer feedback today?', timestamp: '10:00 AM' },
    { id: 4, sessionId: 2, sender: 'user', text: 'Can you summarize the main sentiment from the last 100 reviews?', timestamp: '10:01 AM' },
  ]);

  selectedSessionId: WritableSignal<number | null> = signal(null);
  currentUserInput: WritableSignal<string> = signal('');
  isBotTyping: WritableSignal<boolean> = signal(false);
  user = signal<User>({ name: 'Alex Reid', role: 'Data Analyst', avatar: 'AR' });

  // --- UI & Feature State ---
  renamingSessionId: WritableSignal<number | null> = signal(null);
  isModelSelectorOpen = signal(false);
  isCompanySelectorOpen = signal(false);
  isSidebarOpen = signal(true);
  theme = signal<Theme>('dark');
  isRecording = signal(false);
  private recognition: any;
  chatSearchTerm = signal<string>('');
  openChatMenuId = signal<number | null>(null);
  
  availableCompanies: Company[] = [
    { id: 1, name: 'Globex Corporation' },
    { id: 2, name: 'Stark Industries' },
    { id: 3, name: 'Wayne Enterprises' },
    { id: 4, name: 'Cyberdyne Systems' },
    { id: 5, name: 'Acme Corp' },
  ];
  selectedCompanyIds: WritableSignal<number[]> = signal([1, 3]);

  availableModels: Model[] = [
    { id: 'gemini-3-pro', name: 'Gemini 3 Pro', quality: 'High' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', quality: 'Fast' },
    { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet', quality: 'Balanced' }
  ];

  // --- Computed Signals ---
  selectedSession = computed(() => this.chatHistory().find(c => c.id === this.selectedSessionId()));
  selectedModel = computed(() => {
    const session = this.selectedSession();
    return this.availableModels.find(m => m.id === session?.model) ?? this.availableModels[0];
  });
  
  currentChatMessages = computed(() => {
    const sessionId = this.selectedSessionId();
    if (sessionId === null) return [];
    return this.allMessages()
      .filter(m => m.sessionId === sessionId)
      .sort((a, b) => a.id - b.id);
  });

  isNewChatView = computed(() => {
      const messages = this.currentChatMessages();
      return messages.length <= 1 && (messages.length === 0 || messages[0].sender === 'bot');
  });

  selectedCompanies = computed(() => 
    this.availableCompanies.filter(c => this.selectedCompanyIds().includes(c.id))
  );

  companySelectorText = computed(() => {
    const selected = this.selectedCompanies();
    const count = selected.length;
    if (count === 0 || count === this.availableCompanies.length) {
      return 'All Companies';
    }
    if (count === 1) {
      return selected[0].name;
    }
    if (count === 2) {
      return selected.map(c => c.name).join(', ');
    }
    return `${count} Companies Selected`;
  });

  filteredChatHistory = computed(() => {
    const term = this.chatSearchTerm().toLowerCase();
    if (!term) {
      return this.chatHistory();
    }
    return this.chatHistory().filter(session =>
      session.title.toLowerCase().includes(term)
    );
  });

  constructor() {
    this.setupSpeechRecognition();

    effect(() => {
      if (!this.selectedSessionId() && this.chatHistory().length > 0) {
        this.selectSession(this.chatHistory()[0].id);
      } else if (this.chatHistory().length === 0 && this.allMessages().length === 0) {
        this.startNewChat();
      }
    });

    effect(() => {
      this.currentChatMessages();
      this.scrollToBottom();
    });

    effect(() => {
      const currentTheme = this.theme();
      if (currentTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      localStorage.setItem('theme', currentTheme);
    });
  }

  ngOnInit(): void {
    const savedTheme = localStorage.getItem('theme') as Theme | null;
    if (savedTheme) {
      this.theme.set(savedTheme);
    } else {
      this.theme.set(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    }
  }

  // --- Component Methods ---

  handleEnter(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  sendMessage(): void {
    const messageText = this.currentUserInput().trim();
    if (!messageText) return;

    const sessionId = this.selectedSessionId();
    if (sessionId === null) return;
    
    if (this.currentChatMessages().length <= 1) {
        const newTitle = messageText.length > 40 ? messageText.substring(0, 40) + '...' : messageText;
        this.chatHistory.update(history => history.map(s => s.id === sessionId ? {...s, title: newTitle} : s));
    }

    const newMessage: ChatMessage = {
      id: this.allMessages().length + 1,
      sessionId: sessionId,
      sender: 'user',
      text: messageText,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    };
    
    this.allMessages.update(messages => [...messages, newMessage]);
    this.chatHistory.update(history => history.map(s => s.id === sessionId ? {...s, lastMessage: messageText} : s));
    this.currentUserInput.set('');
    this.autoResizeTextarea();

    this.isBotTyping.set(true);
    setTimeout(() => {
      const botResponse: ChatMessage = {
        id: this.allMessages().length + 1,
        sessionId: sessionId,
        sender: 'bot',
        text: this.getBotResponse(messageText),
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      };
      this.isBotTyping.set(false);
      this.allMessages.update(messages => [...messages, botResponse]);
    }, 1500);
  }
  
  private getBotResponse(prompt: string): string {
    const lowerCasePrompt = prompt.toLowerCase().trim();
    if (lowerCasePrompt === 'generate table response') {
        return this.getSampleTableResponse();
    }
    if (lowerCasePrompt === 'create infographics') {
        return this.getSampleInfographicResponse();
    }
    // Default to text for "generate text response" and any other prompt.
    return this.getSampleTextResponse();
  }

  private getSampleTextResponse(): string {
    return `<p>This is a sample text response. The analysis shows a positive trend in market sentiment. We've observed a 15% increase in positive mentions across social media platforms in the last quarter. Further details can be provided upon request.</p>`;
  }

  private getSampleInfographicResponse(): string {
    return `
      <p class="mb-2 text-slate-600 dark:text-slate-300">Of course! Here's an infographic summarizing the user engagement data:</p>
      <div class="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-slate-800/50">
          <h3 class="font-bold text-lg mb-4 text-slate-800 dark:text-slate-200">User Engagement Q2</h3>
          <div class="relative h-48 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg">
            <!-- Y-axis labels and grid lines -->
            <div class="absolute text-xs text-slate-400 -left-1 top-0 transform -translate-x-full -translate-y-1/2">100%</div>
            <div class="absolute w-full h-px bg-slate-200 dark:bg-slate-700 left-0 top-0"></div>
            
            <div class="absolute text-xs text-slate-400 -left-1 top-1/4 transform -translate-x-full -translate-y-1/2">75%</div>
            <div class="absolute w-full h-px bg-slate-200 dark:bg-slate-700 left-0 top-1/4"></div>
            
            <div class="absolute text-xs text-slate-400 -left-1 top-1/2 transform -translate-x-full -translate-y-1/2">50%</div>
            <div class="absolute w-full h-px bg-slate-200 dark:bg-slate-700 left-0 top-1/2"></div>

            <div class="absolute text-xs text-slate-400 -left-1 top-3/4 transform -translate-x-full -translate-y-1/2">25%</div>
            <div class="absolute w-full h-px bg-slate-200 dark:bg-slate-700 left-0 top-3/4"></div>
            
            <div class="flex justify-around items-end h-full pt-4">
                <div class="flex flex-col items-center w-1/4 h-full group relative">
                    <div class="w-1/2 bg-blue-500 rounded-t-md hover:bg-blue-400 transition-colors" style="height: 45%;">
                         <span class="absolute -top-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-slate-900 text-white text-xs px-2 py-1 rounded-md shadow-lg transition-opacity">45%</span>
                    </div>
                    <div class="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium text-center">New Users</div>
                </div>
                <div class="flex flex-col items-center w-1/4 h-full group relative">
                    <div class="w-1/2 bg-green-500 rounded-t-md hover:bg-green-400 transition-colors" style="height: 82%;">
                         <span class="absolute -top-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-slate-900 text-white text-xs px-2 py-1 rounded-md shadow-lg transition-opacity">82%</span>
                    </div>
                    <div class="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium text-center">Active Users</div>
                </div>
                <div class="flex flex-col items-center w-1/4 h-full group relative">
                    <div class="w-1/2 bg-fuchsia-500 rounded-t-md hover:bg-fuchsia-400 transition-colors" style="height: 65%;">
                         <span class="absolute -top-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-slate-900 text-white text-xs px-2 py-1 rounded-md shadow-lg transition-opacity">65%</span>
                    </div>
                    <div class="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium text-center">Retention</div>
                </div>
            </div>
          </div>
      </div>
      <p class="mt-4 text-sm text-slate-600 dark:text-slate-400">
          The data indicates a strong quarter for user activity, with an <strong>82% active user rate</strong>. While new user acquisition is solid at 45%, the key focus should be on improving the 65% retention rate to drive long-term growth.
      </p>
    `;
  }

  private getSampleTableResponse(): string {
    return `
      <p class="mb-2 text-slate-600 dark:text-slate-300">Certainly! Here is a summary of the Q2 sales performance by region:</p>
      <div class="overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-700">
        <table class="min-w-full text-left text-sm">
          <thead class="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th class="p-3 font-semibold text-slate-700 dark:text-slate-300">Region</th>
              <th class="p-3 font-semibold text-slate-700 dark:text-slate-300">Revenue</th>
              <th class="p-3 font-semibold text-slate-700 dark:text-slate-300">Growth vs Q1</th>
            </tr>
          </thead>
          <tbody class="bg-white dark:bg-slate-800/50">
            <tr>
              <td class="p-3 border-t border-slate-100 dark:border-slate-700">North America</td>
              <td class="p-3 border-t border-slate-100 dark:border-slate-700">$650,000</td>
              <td class="p-3 border-t border-slate-100 dark:border-slate-700 text-green-500 dark:text-green-400">+12%</td>
            </tr>
            <tr>
              <td class="p-3 border-t border-slate-100 dark:border-slate-700">Europe</td>
              <td class="p-3 border-t border-slate-100 dark:border-slate-700">$400,000</td>
              <td class="p-3 border-t border-slate-100 dark:border-slate-700 text-green-500 dark:text-green-400">+18%</td>
            </tr>
            <tr>
              <td class="p-3 border-t border-slate-100 dark:border-slate-700">Asia-Pacific</td>
              <td class="p-3 border-t border-slate-100 dark:border-slate-700">$150,000</td>
              <td class="p-3 border-t border-slate-100 dark:border-slate-700 text-red-500 dark:text-red-400">-5%</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  startNewChat(): void {
    const newId = this.chatHistory().length > 0 ? Math.max(...this.chatHistory().map(c => c.id)) + 1 : 1;
    const newSession: ChatSession = { id: newId, title: `New Conversation`, lastMessage: "...", model: 'gemini-3-pro' };
    this.chatHistory.update(history => [newSession, ...history]);
    this.allMessages.update(messages => [
      ...messages,
      {
        id: this.allMessages().length > 0 ? Math.max(...this.allMessages().map(m => m.id)) + 1 : 1,
        sessionId: newId,
        sender: 'bot',
        text: 'How can I help you today?',
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    this.selectSession(newId);
  }

  selectSession(sessionId: number): void {
    if (this.renamingSessionId() !== null) this.cancelRename();
    this.selectedSessionId.set(sessionId);
    this.isModelSelectorOpen.set(false);
  }

  copyMessage(text: string): void {
    const tempEl = document.createElement('div');
    tempEl.innerHTML = text;
    navigator.clipboard.writeText(tempEl.textContent || "").catch(err => console.error('Failed to copy text: ', err));
  }

  deleteSession(sessionId: number): void {
    if (!confirm('Are you sure you want to delete this chat?')) return;
    this.chatHistory.update(history => history.filter(s => s.id !== sessionId));
    this.allMessages.update(messages => messages.filter(m => m.sessionId !== sessionId));
    if (this.selectedSessionId() === sessionId) {
      this.selectedSessionId.set(null);
    }
  }

  archiveSession(sessionId: number): void {
    // This is a placeholder for archive functionality
    console.log(`Archiving session ${sessionId}`);
    // You might want to add an 'isArchived' flag to the session
    // and filter it from the main chat history view.
    this.openChatMenuId.set(null);
  }

  toggleChatMenu(sessionId: number, event: MouseEvent): void {
    event.stopPropagation();
    this.openChatMenuId.update(currentId => (currentId === sessionId ? null : sessionId));
  }

  startRenaming(sessionId: number, event: MouseEvent, input: HTMLInputElement): void {
    event.stopPropagation();
    this.openChatMenuId.set(null);
    this.renamingSessionId.set(sessionId);
    setTimeout(() => input.focus(), 0);
  }

  saveRename(session: ChatSession, newTitle: string): void {
    const trimmedTitle = newTitle.trim();
    if (trimmedTitle && trimmedTitle !== session.title) {
        this.chatHistory.update(history => history.map(s => s.id === session.id ? { ...s, title: trimmedTitle } : s));
    }
    this.cancelRename();
  }

  cancelRename(): void { this.renamingSessionId.set(null); }
  
  setModel(modelId: string): void {
    const sessionId = this.selectedSessionId();
    if (!sessionId) return;
    this.chatHistory.update(history => history.map(s => s.id === sessionId ? {...s, model: modelId} : s));
    this.isModelSelectorOpen.set(false);
  }

  toggleTheme(): void {
    this.theme.update(current => (current === 'dark' ? 'light' : 'dark'));
  }

  toggleSidebar(): void {
    this.isSidebarOpen.update(open => !open);
  }

  toggleCompanySelector(): void {
    this.isCompanySelectorOpen.update(open => !open);
  }

  toggleCompanySelection(companyId: number): void {
    this.selectedCompanyIds.update(ids => {
      const newIds = [...ids];
      const index = newIds.indexOf(companyId);
      if (index > -1) {
        newIds.splice(index, 1);
      } else {
        newIds.push(companyId);
      }
      return newIds;
    });
  }

  isCompanySelected(companyId: number): boolean {
    return this.selectedCompanyIds().includes(companyId);
  }

  triggerFileInput(): void {
    this.fileInput.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      console.log('File selected:', input.files[0].name);
      // Handle file upload logic here
    }
  }

  autoResizeTextarea(): void {
    setTimeout(() => {
        const textarea = this.promptTextarea.nativeElement;
        textarea.style.height = 'auto';
        const scrollHeight = textarea.scrollHeight;
        const maxHeight = 200; // Corresponds to max-h-50
        textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }, 0);
  }

  onDocumentClick(event: MouseEvent): void {
    if (this.isModelSelectorOpen() && this.modelSelectorContainer?.nativeElement && !this.modelSelectorContainer.nativeElement.contains(event.target)) {
      this.isModelSelectorOpen.set(false);
    }
    if (this.isCompanySelectorOpen() && this.companySelectorContainer?.nativeElement && !this.companySelectorContainer.nativeElement.contains(event.target)) {
      this.isCompanySelectorOpen.set(false);
    }
    // Clicks outside of an open chat menu will close it.
    // Menu toggles and item clicks use stopPropagation() to prevent this.
    if (this.openChatMenuId() !== null) {
      this.openChatMenuId.set(null);
    }
  }

  toggleVoiceRecognition(): void {
    if (!this.recognition) {
        console.warn('Speech Recognition API not supported, cannot start recognition.');
        return;
    }

    if (this.isRecording()) {
        this.recognition.stop();
    } else {
        this.recognition.start();
    }
  }
  
  private setupSpeechRecognition(): void {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.lang = 'en-US';
        this.recognition.interimResults = false;
        this.recognition.maxAlternatives = 1;

        this.recognition.onstart = () => {
            this.isRecording.set(true);
        };

        this.recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            this.currentUserInput.update(current => current ? `${current} ${transcript}` : transcript);
            this.autoResizeTextarea();
        };

        this.recognition.onend = () => {
            this.isRecording.set(false);
        };

        this.recognition.onerror = (event: any) => {
            console.error('Speech recognition error:', event.error);
            this.isRecording.set(false);
        };
    } else {
        console.warn('Speech Recognition API not supported in this browser.');
    }
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      try {
        if (this.messageContainer?.nativeElement) {
          this.messageContainer.nativeElement.scrollTop = this.messageContainer.nativeElement.scrollHeight;
        }
      } catch (err) { console.error("Could not scroll to bottom:", err); }
    }, 0);
  }
}
