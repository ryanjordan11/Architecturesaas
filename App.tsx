import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration, Blob as GenAIBlob } from '@google/genai';
import { 
  ArchitectureSpec, 
  OwnerRole, 
  ProductType, 
  DeviceType, 
  Timeframe, 
  ContentOwner, 
  Visibility, 
  RetentionPolicy, 
  BackupFrequency,
  FailureSystem,
  UserRole,
  UserFlow,
  Entity,
  Page,
  Integration,
  Milestone,
  FieldType,
  DataDirection,
  IntegrationFailureBehavior,
  SuccessMetric
} from './types';
import { STEPS, HARD_STOPS } from './constants';

// --- CONFIGURATION ---
const HUBSPOT_CONFIG = {
  PORTAL_ID: '50958176',
  FORM_GUID: '85f31a4f-f02f-439e-bf1e-50594d9ec034',
};

const STORAGE_KEY = 'arch_builder_persistent_state_v3';

const INITIAL_STATE: ArchitectureSpec = {
  status: 'draft',
  contextNotes: '',
  projectMeta: {
    projectName: '',
    ownerName: '',
    ownerEmail: '',
    ownerRole: OwnerRole.FOUNDER,
    createdAt: new Date().toISOString(),
    version: 'v1'
  },
  definition: {
    productType: ProductType.WEB_APP,
    oneSentence: '',
    jobToBeDone: ''
  },
  users: {
    roles: [],
    regions: [],
    languages: [],
    accessibilityRequired: false,
    expectedUsers: { now: 0, in12Months: 0 }
  },
  success: {
    metrics: [],
    nonGoals: [],
    niceToHaves: []
  },
  flows: [],
  features: {
    mustHave: [],
    shouldHave: [],
    couldHave: [],
    wontHave: []
  },
  content: {
    pages: [],
    branding: {
      colors: [],
      fonts: [],
      tone: '',
      forbiddenPhrases: []
    }
  },
  dataModel: [],
  stateRules: {
    durableData: [],
    ephemeralData: [],
    sourceOfTruth: {},
    readOnlyOnFailure: false,
    offlineSupport: false
  },
  permissions: {},
  integrations: [],
  aiPolicy: {
    allowed: {
      suggest: true,
      generateDrafts: true,
      generateFinal: false,
      executeActions: false
    },
    forbidden: {
      schemaChanges: true,
      deleteData: true,
      permissionChanges: true,
      deployCode: true
    },
    approvalRequiredFor: [],
    validationRules: [],
    auditLogEnabled: true
  },
  failureModes: {
    [FailureSystem.AUTH]: '',
    [FailureSystem.DB]: '',
    [FailureSystem.AI]: '',
    [FailureSystem.UPLOAD]: '',
    [FailureSystem.PAYMENT]: '',
    [FailureSystem.DEPLOY]: ''
  },
  performance: {
    concurrentUsersTarget: 0,
    maxUploadSizeMB: 0,
    pageLoadTargetMs: 2000,
    cdnRequired: false
  },
  security: {
    sensitiveDataTypes: [],
    twoFactorRequired: false,
    auditLogsRequired: false,
    dataExportRequired: false,
    regulatoryRequirements: []
  },
  operations: {
    deployOwner: '',
    backupFrequency: BackupFrequency.DAILY,
    restoreTestFrequency: '',
    monitoringEvents: [],
    adminToolsRequired: []
  },
  buildPlan: [],
  changeControl: {
    whoCanChangeRequirements: [],
    allowedMidBuildChanges: [],
    rearchitectureTriggers: [],
    schemaVersioningStrategy: ''
  },
  assumptions: []
};

// --- UTILS ---
function encode(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function createMediaInput(data: Float32Array): GenAIBlob {
  const int16 = new Int16Array(data.length);
  for (let i = 0; i < data.length; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

const updateSpecFieldDeclaration: FunctionDeclaration = {
  name: 'update_spec_field',
  parameters: {
    type: Type.OBJECT,
    description: 'Updates a part of the architecture. Supports dot-notation (e.g., "projectMeta.projectName") or arrays if JSON is provided.',
    properties: {
      path: { type: Type.STRING, description: 'Field path' },
      value: { type: Type.STRING, description: 'Value (JSON string for objects/arrays)' },
    },
    required: ['path', 'value'],
  },
};

const goToStepDeclaration: FunctionDeclaration = {
  name: 'go_to_step',
  parameters: {
    type: Type.OBJECT,
    description: 'Moves the screen to a specific step.',
    properties: {
      step_index: { type: Type.NUMBER, description: '0-17' },
    },
    required: ['step_index'],
  },
};

const App: React.FC = () => {
  const [spec, setSpec] = useState<ArchitectureSpec>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : INITIAL_STATE;
  });
  const [currentStep, setCurrentStep] = useState<number>(() => {
    const savedStep = localStorage.getItem(STORAGE_KEY + '_step');
    return savedStep ? parseInt(savedStep, 10) : 0;
  });

  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(spec.status === 'locked');
  const [voiceState, setVoiceState] = useState<'inactive' | 'active' | 'paused' | 'reconnecting'>('inactive');
  const [submissionStatus, setSubmissionStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  const sessionRef = useRef<any>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const isPausedRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(spec));
    localStorage.setItem(STORAGE_KEY + '_step', currentStep.toString());
  }, [spec, currentStep]);

  const updateFieldByPath = useCallback((path: string, value: any) => {
    setSpec(prev => {
      if (prev.status === 'locked') return prev;
      const next = JSON.parse(JSON.stringify(prev));
      const parts = path.split('.');
      let current: any = next;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) current[parts[i]] = {};
        current = current[parts[i]];
      }
      const last = parts[parts.length - 1];
      let valToSet = value;
      if (typeof value === 'string') {
        try { 
          const parsed = JSON.parse(value); 
          valToSet = parsed;
        } catch {
          valToSet = value;
        }
      }
      current[last] = valToSet;
      return next;
    });
  }, []);

  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleSubmitDesign = async () => {
    if (!isValidEmail(spec.projectMeta.ownerEmail)) return;
    setSubmissionStatus('submitting');
    try {
      const response = await fetch(`https://api.hsforms.com/submissions/v3/integration/submit/${HUBSPOT_CONFIG.PORTAL_ID}/${HUBSPOT_CONFIG.FORM_GUID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: [
            { name: 'email', value: spec.projectMeta.ownerEmail },
            { name: 'firstname', value: spec.projectMeta.ownerName.split(' ')[0] },
            { name: 'company', value: spec.projectMeta.projectName }
          ]
        })
      });
      if (response.ok) setSubmissionStatus('success');
      else throw new Error('HubSpot submission failed');
    } catch (err) {
      console.error(err);
      setSubmissionStatus('error');
    }
  };

  const startVoiceSession = async () => {
    if (voiceState !== 'inactive') return;
    setVoiceError(null);
    try {
      if (!inputAudioContextRef.current) inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      if (!outputAudioContextRef.current) outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setVoiceState('active');
            const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              if (isPausedRef.current) return;
              const media = createMediaInput(e.inputBuffer.getChannelData(0));
              sessionPromise.then(s => s.sendRealtimeInput({ media }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (isPausedRef.current) return;
            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData && outputAudioContextRef.current) {
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContextRef.current.currentTime);
              const buffer = await decodeAudioData(decode(audioData), outputAudioContextRef.current, 24000, 1);
              const source = outputAudioContextRef.current.createBufferSource();
              source.buffer = buffer;
              source.connect(outputAudioContextRef.current.destination);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
            }
            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                if (fc.name === 'update_spec_field') {
                  const { path, value } = fc.args as any;
                  updateFieldByPath(path, value);
                  sessionPromise.then(s => s.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: "ok" } } }));
                } else if (fc.name === 'go_to_step') {
                  const { step_index } = fc.args as any;
                  setCurrentStep(step_index);
                  sessionPromise.then(s => s.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: "ok" } } }));
                }
              }
            }
          },
          onclose: () => stopVoiceSession(),
          onerror: (e: any) => { setVoiceError(e?.message || "Voice API Error"); stopVoiceSession(); }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          tools: [{ functionDeclarations: [updateSpecFieldDeclaration, goToStepDeclaration] }],
          systemInstruction: `Senior Architect consultant. Guide user through 18 design steps. Key: Precision. Current email: ${spec.projectMeta.ownerEmail}`,
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (e: any) {
      setVoiceError(e.message);
      setVoiceState('inactive');
    }
  };

  const stopVoiceSession = async () => {
    if (sessionRef.current) try { sessionRef.current.close(); } catch {}
    sessionRef.current = null;
    setVoiceState('inactive');
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">00. Project Meta</h2>
            <InputField label="Project Name" path="projectMeta.projectName" value={spec.projectMeta.projectName} update={updateFieldByPath} />
            <InputField label="Owner Name" path="projectMeta.ownerName" value={spec.projectMeta.ownerName} update={updateFieldByPath} />
            <InputField label="Email Address" type="email" path="projectMeta.ownerEmail" value={spec.projectMeta.ownerEmail} update={updateFieldByPath} />
            <SelectField label="Role" path="projectMeta.ownerRole" value={spec.projectMeta.ownerRole} options={Object.values(OwnerRole)} update={updateFieldByPath} />
          </div>
        );
      case 17:
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">17. Finalization</h2>
            <div className="bg-slate-50 p-6 md:p-8 rounded-2xl border border-blue-600/30 text-center space-y-4">
              {!isLocked ? (
                <button onClick={() => { setIsLocked(true); updateFieldByPath('status', 'locked'); }} className="bg-blue-600 w-full py-4 rounded-xl font-bold text-white hover:bg-blue-700 shadow-lg active:scale-95 transition-transform">LOCK ARCHITECTURE</button>
              ) : (
                <button onClick={handleSubmitDesign} className={`w-full py-4 ${submissionStatus === 'success' ? 'bg-blue-50 text-blue-700' : 'bg-slate-900 text-white'} rounded-xl font-bold uppercase text-xs active:scale-95 transition-transform`}>
                  {submissionStatus === 'submitting' ? 'Syncing...' : submissionStatus === 'success' ? 'Synced to CRM' : 'Sync to HubSpot'}
                </button>
              )}
            </div>
          </div>
        );
      default:
        return (
          <div className="flex flex-col items-center justify-center min-h-[300px] md:h-64 border border-dashed border-slate-200 rounded-lg bg-slate-50 p-6 text-center">
            <span className="text-slate-400 font-mono text-sm uppercase tracking-widest mb-2">{STEPS[currentStep]}</span>
            <p className="text-[11px] text-slate-500 uppercase font-medium leading-relaxed">Consulting in Progress...<br/>Provide voice or text input.</p>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 lg:bg-white text-slate-900 transition-all">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-slate-100 px-4 md:px-6 py-3 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 w-7 h-7 md:w-8 md:h-8 rounded flex items-center justify-center font-bold text-white text-sm md:text-base">A</div>
          <h1 className="text-base md:text-lg font-bold tracking-tight whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px] md:max-w-none">Arch Builder</h1>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          <button 
            onClick={voiceState === 'inactive' ? startVoiceSession : stopVoiceSession} 
            className={`p-2 rounded-full transition-all ${voiceState === 'active' ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-100 text-slate-400 hover:text-slate-900'}`}
          >
            <MicIcon />
          </button>
          <div className="mono text-slate-500 text-[10px] md:text-xs font-bold bg-white px-2 py-1 rounded border border-slate-200 shadow-sm">
            {currentStep + 1}<span className="opacity-40 px-0.5">/</span>{STEPS.length}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full flex flex-col lg:grid lg:grid-cols-12 lg:gap-8 p-4 md:p-6 lg:p-8">
        <aside className="lg:col-span-3 lg:block lg:space-y-1 overflow-x-auto lg:overflow-y-auto lg:max-h-[80vh] mb-4 lg:mb-0 pb-2 lg:pb-0 scrollbar-hide flex lg:flex-col gap-2">
          {STEPS.map((step, idx) => (
            <button 
              key={idx} 
              onClick={() => setCurrentStep(idx)} 
              className={`flex-shrink-0 lg:w-full text-left px-3 py-2 rounded text-[10px] font-bold uppercase whitespace-nowrap transition-all ${currentStep === idx ? 'bg-blue-600 text-white lg:translate-x-1 shadow-md' : 'bg-white lg:bg-transparent text-slate-400 hover:text-slate-900 border border-slate-100 lg:border-none'}`}
            >
              <span className="mono opacity-50 mr-1.5 lg:mr-2">{(idx + 1).toString().padStart(2, '0')}</span>{step}
            </button>
          ))}
        </aside>

        <section className="lg:col-span-6 flex flex-col bg-white rounded-2xl border border-slate-100 p-5 md:p-8 shadow-xl lg:shadow-2xl relative min-h-[450px] lg:min-h-[600px]">
          <div className="flex-1">{renderStepContent()}</div>
          <div className="mt-8 md:mt-12 flex justify-between items-center pt-6 border-t border-slate-100">
            <button 
              disabled={currentStep === 0}
              onClick={() => currentStep > 0 && setCurrentStep(c => c - 1)} 
              className="px-5 md:px-6 py-2 rounded border border-slate-200 text-slate-400 disabled:opacity-30 text-[10px] md:text-xs font-bold uppercase hover:bg-slate-50 active:scale-95 transition-all"
            >
              Back
            </button>
            <button 
              disabled={currentStep === STEPS.length - 1}
              onClick={() => currentStep < STEPS.length - 1 && setCurrentStep(c => c + 1)} 
              className="px-6 md:px-8 py-2 rounded bg-blue-600 text-white font-bold text-[10px] md:text-xs uppercase tracking-widest hover:bg-blue-700 active:scale-95 transition-all shadow-md shadow-blue-200 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </section>

        <aside className="lg:col-span-3 space-y-4 md:space-y-6 flex flex-col mt-4 lg:mt-0">
          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-md">
             <h3 className="text-[10px] font-bold text-slate-400 uppercase mb-3 tracking-widest border-b pb-1">Notes / Intent</h3>
             <textarea 
               value={spec.contextNotes} 
               onChange={(e) => updateFieldByPath('contextNotes', e.target.value)} 
               className="w-full h-24 lg:h-40 bg-slate-50 border border-slate-100 rounded p-3 text-[11px] outline-none focus:ring-1 focus:ring-blue-100 resize-none transition-all" 
               placeholder="Brain dump architectural details here..." 
             />
          </div>
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex-1 text-[9px] text-blue-300/80 font-mono whitespace-pre-wrap overflow-hidden shadow-xl hidden lg:block">
             <div className="mb-2 text-white/40 border-b border-white/5 pb-1">DEBUG_STATE_RAW</div>
             {JSON.stringify(spec, null, 1)}
          </div>
        </aside>
      </main>

      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        input, select, textarea { font-size: 16px !important; }
      `}</style>
    </div>
  );
};

const InputField = ({ label, path, value, update, type = "text" }: any) => (
  <div className="w-full text-left">
    <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-widest">{label}</label>
    <input 
      type={type} 
      value={value} 
      onChange={e => update(path, e.target.value)} 
      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 md:py-3 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 text-sm transition-all shadow-sm placeholder:text-slate-300" 
      placeholder={`Enter ${label.toLowerCase()}...`}
    />
  </div>
);

const SelectField = ({ label, path, value, options, update }: any) => (
  <div className="w-full text-left">
    <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-widest">{label}</label>
    <div className="relative">
      <select 
        value={value} 
        onChange={e => update(path, e.target.value)} 
        className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-4 py-2.5 md:py-3 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 text-sm transition-all shadow-sm"
      >
        {options.map((o: any) => <option key={o} value={o}>{o}</option>)}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
      </div>
    </div>
  </div>
);

const MicIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
);

export default App;