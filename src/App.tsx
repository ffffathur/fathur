/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  Users, 
  UserCheck, 
  Volume2, 
  RotateCcw, 
  Monitor, 
  LayoutDashboard,
  ChevronRight,
  Hospital,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Modality } from "@google/genai";

// Types
type QueueType = 'UMUM' | 'BPJS';

interface QueueState {
  type: QueueType;
  current_number: number;
}

interface LastCall {
  type: QueueType;
  number: number;
  counter: number;
}

// Client Configuration
const CLIENTS = [
  { id: 1, type: 'UMUM' as QueueType, name: 'Loket 1 (Umum)' },
  { id: 2, type: 'UMUM' as QueueType, name: 'Loket 2 (Umum)' },
  { id: 3, type: 'BPJS' as QueueType, name: 'Loket 3 (BPJS)' },
  { id: 4, type: 'BPJS' as QueueType, name: 'Loket 4 (BPJS)' },
  { id: 5, type: 'BPJS' as QueueType, name: 'Loket 5 (BPJS)' },
  { id: 6, type: 'BPJS' as QueueType, name: 'Loket 6 (BPJS)' },
  { id: 7, type: 'BPJS' as QueueType, name: 'Loket 7 (BPJS)' },
  { id: 8, type: 'BPJS' as QueueType, name: 'Loket 8 (BPJS)' },
];

export default function App() {
  const [view, setView] = useState<'selection' | 'display' | 'client'>('selection');
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [queueState, setQueueState] = useState<QueueState[]>([]);
  const [lastCall, setLastCall] = useState<LastCall | null>(null);
  const [isCalling, setIsCalling] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    socketRef.current = io();

    socketRef.current.on('state_updated', (data: { state: QueueState[], lastCall: LastCall | null }) => {
      setQueueState(data.state);
      setLastCall(data.lastCall);
    });

    socketRef.current.on('new_call', (data: LastCall) => {
      setLastCall(data);
      if (view === 'display') {
        speakCall(data);
      }
    });

    // Initial fetch
    fetch('/api/state')
      .then(res => res.json())
      .then(data => {
        setQueueState(data.state);
        setLastCall(data.lastCall);
      });

    return () => {
      socketRef.current?.disconnect();
    };
  }, [view]);

  const speakCall = async (call: LastCall) => {
    if (isCalling) return;
    setIsCalling(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const typeText = call.type === 'UMUM' ? 'Umum' : 'B P J S';
      const prompt = `Panggilan antrian. Nomor antrian ${typeText}, ${call.number}, silakan menuju ke loket ${call.counter}.`;
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioData = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0)).buffer;
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const buffer = await audioContextRef.current.decodeAudioData(audioData);
        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContextRef.current.destination);
        source.onended = () => setIsCalling(false);
        source.start();
      } else {
        setIsCalling(false);
      }
    } catch (error) {
      console.error("TTS Error:", error);
      setIsCalling(false);
    }
  };

  const handleCallNext = (type: QueueType, counter: number) => {
    socketRef.current?.emit('call_next', { type, counter });
  };

  const handleRecall = () => {
    if (lastCall) {
      socketRef.current?.emit('recall', lastCall);
    }
  };

  const handleReset = async () => {
    if (confirm('Apakah Anda yakin ingin mereset semua antrian?')) {
      await fetch('/api/reset', { method: 'POST' });
    }
  };

  const getQueueNumber = (type: QueueType) => {
    return queueState.find(s => s.type === type)?.current_number || 0;
  };

  if (view === 'selection') {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center p-6 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl w-full bg-white rounded-3xl shadow-sm border border-black/5 p-12"
        >
          <div className="flex items-center gap-4 mb-12">
            <div className="p-3 bg-emerald-500 rounded-2xl">
              <Hospital className="text-white w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold text-zinc-900 tracking-tight">Sistem Antrian Rumah Sakit</h1>
              <p className="text-zinc-500">Pilih mode tampilan untuk memulai</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <button 
              onClick={() => setView('display')}
              className="group p-8 border-2 border-zinc-100 rounded-3xl hover:border-emerald-500 hover:bg-emerald-50 transition-all text-left"
            >
              <Monitor className="w-12 h-12 text-zinc-400 group-hover:text-emerald-500 mb-6" />
              <h3 className="text-xl font-medium text-zinc-900 mb-2">Layar Antrian (Display)</h3>
              <p className="text-zinc-500 text-sm">Tampilan monitor untuk ruang tunggu pasien.</p>
            </button>

            <div className="p-8 border-2 border-zinc-100 rounded-3xl">
              <LayoutDashboard className="w-12 h-12 text-zinc-400 mb-6" />
              <h3 className="text-xl font-medium text-zinc-900 mb-4">Panel Petugas (Client)</h3>
              <div className="grid grid-cols-2 gap-2">
                {CLIENTS.map(client => (
                  <button
                    key={client.id}
                    onClick={() => {
                      setSelectedClientId(client.id);
                      setView('client');
                    }}
                    className="px-4 py-2 text-sm font-medium bg-zinc-50 text-zinc-600 rounded-xl hover:bg-zinc-900 hover:text-white transition-colors"
                  >
                    Loket {client.id}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-zinc-100 flex justify-between items-center">
            <button 
              onClick={handleReset}
              className="flex items-center gap-2 text-zinc-400 hover:text-red-500 transition-colors text-sm font-medium"
            >
              <RotateCcw className="w-4 h-4" />
              Reset Semua Antrian
            </button>
            <p className="text-zinc-400 text-xs font-mono">v1.0.0 • Hospital Queue System</p>
          </div>
        </motion.div>
      </div>
    );
  }

  if (view === 'display') {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white font-sans overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-8 border-b border-white/10 flex justify-between items-center bg-zinc-900/50 backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <Hospital className="text-emerald-500 w-10 h-10" />
            <div>
              <h1 className="text-2xl font-bold tracking-tighter uppercase">RSUD H M Rabain</h1>
              <p className="text-zinc-500 text-xs tracking-widest uppercase font-medium">Sistem Panggilan Antrian Digital</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest">Waktu Lokal</p>
              <ClockDisplay />
            </div>
            <button onClick={() => setView('selection')} className="p-2 hover:bg-white/5 rounded-full transition-colors">
              <RotateCcw className="w-5 h-5 text-zinc-500" />
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 grid grid-cols-12 gap-8 p-8">
          {/* Left: Current Call */}
          <div className="col-span-12 lg:col-span-8 flex flex-col gap-8">
            <div className="flex-1 bg-zinc-900 rounded-[40px] border border-white/5 p-12 flex flex-col items-center justify-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500" />
              <AnimatePresence mode="wait">
                {lastCall ? (
                  <motion.div
                    key={`${lastCall.type}-${lastCall.number}`}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.1 }}
                    className="text-center"
                  >
                    <p className="text-emerald-500 font-mono text-xl tracking-[0.3em] uppercase mb-4">Sedang Dipanggil</p>
                    <h2 className="text-[12rem] font-bold leading-none tracking-tighter mb-8">
                      {lastCall.type === 'UMUM' ? 'A' : 'B'}-{lastCall.number.toString().padStart(3, '0')}
                    </h2>
                    <div className="inline-flex items-center gap-4 px-12 py-6 bg-white text-black rounded-full">
                      <UserCheck className="w-8 h-8" />
                      <span className="text-4xl font-bold uppercase tracking-tight">LOKET {lastCall.counter}</span>
                    </div>
                  </motion.div>
                ) : (
                  <div className="text-zinc-600 text-center">
                    <Users className="w-24 h-24 mx-auto mb-6 opacity-20" />
                    <p className="text-2xl font-medium">Belum ada panggilan</p>
                  </div>
                )}
              </AnimatePresence>
              
              {isCalling && (
                <motion.div 
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="absolute bottom-12 flex items-center gap-2 text-emerald-500"
                >
                  <Volume2 className="w-6 h-6" />
                  <span className="text-sm font-mono uppercase tracking-widest">Suara Panggilan Aktif</span>
                </motion.div>
              )}
            </div>
          </div>

          {/* Right: Stats */}
          <div className="col-span-12 lg:col-span-4 flex flex-col gap-8">
            <div className="bg-zinc-900 rounded-[40px] border border-white/5 p-8 flex-1">
              <h3 className="text-zinc-500 font-mono text-xs tracking-widest uppercase mb-8">Status Antrian</h3>
              
              <div className="space-y-6">
                <div className="p-6 bg-white/5 rounded-3xl border border-white/5">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-zinc-400 font-medium">ANTRIAN UMUM</span>
                    <span className="px-2 py-1 bg-emerald-500/20 text-emerald-500 text-[10px] font-bold rounded">AKTIF</span>
                  </div>
                  <div className="text-5xl font-bold tracking-tighter">
                    A-{getQueueNumber('UMUM').toString().padStart(3, '0')}
                  </div>
                </div>

                <div className="p-6 bg-white/5 rounded-3xl border border-white/5">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-zinc-400 font-medium">ANTRIAN BPJS</span>
                    <span className="px-2 py-1 bg-emerald-500/20 text-emerald-500 text-[10px] font-bold rounded">AKTIF</span>
                  </div>
                  <div className="text-5xl font-bold tracking-tighter">
                    B-{getQueueNumber('BPJS').toString().padStart(3, '0')}
                  </div>
                </div>
              </div>

              <div className="mt-12 p-6 bg-emerald-500/10 rounded-3xl border border-emerald-500/20">
                <p className="text-emerald-500 text-sm font-medium leading-relaxed">
                  Mohon perhatikan nomor antrian Anda pada layar. Siapkan dokumen pendukung sebelum menuju loket.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Marquee */}
        <div className="bg-emerald-500 text-black py-3 overflow-hidden whitespace-nowrap">
          <motion.div 
            animate={{ x: [0, -1000] }}
            transition={{ repeat: Infinity, duration: 30, ease: "linear" }}
            className="inline-block text-sm font-bold uppercase tracking-wider"
          >
            Selamat Datang di RSUD H M Rabain • Utamakan Keselamatan dan Kesehatan Anda • Tetap Gunakan Masker di Area Rumah Sakit • Terima Kasih Atas Kepercayaan Anda • 
          </motion.div>
        </div>
      </div>
    );
  }

  if (view === 'client' && selectedClientId) {
    const client = CLIENTS.find(c => c.id === selectedClientId)!;
    return (
      <div className="min-h-screen bg-[#F5F5F5] font-sans p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <button 
              onClick={() => setView('selection')}
              className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 transition-colors font-medium"
            >
              <ChevronRight className="w-4 h-4 rotate-180" />
              Kembali
            </button>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">Sistem Online</span>
            </div>
          </div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-[32px] shadow-sm border border-black/5 overflow-hidden"
          >
            <div className="p-8 bg-zinc-900 text-white">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight mb-1">{client.name}</h2>
                  <p className="text-zinc-400 text-sm uppercase tracking-widest font-medium">Panel Petugas Loket</p>
                </div>
                <div className="px-4 py-2 bg-white/10 rounded-xl border border-white/10">
                  <span className="text-xs font-mono text-zinc-400 block mb-1">TIPE ANTRIAN</span>
                  <span className="font-bold text-emerald-400">{client.type}</span>
                </div>
              </div>
            </div>

            <div className="p-12 text-center">
              <p className="text-zinc-400 font-mono text-xs tracking-widest uppercase mb-4">Nomor Antrian Saat Ini</p>
              <div className="text-8xl font-bold tracking-tighter text-zinc-900 mb-12">
                {client.type === 'UMUM' ? 'A' : 'B'}-{getQueueNumber(client.type).toString().padStart(3, '0')}
              </div>

              <div className="grid grid-cols-1 gap-4">
                <button
                  onClick={() => handleCallNext(client.type, client.id)}
                  className="w-full py-6 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-bold text-xl shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                >
                  <UserCheck className="w-6 h-6" />
                  PANGGIL BERIKUTNYA
                </button>
                
                <button
                  onClick={handleRecall}
                  disabled={!lastCall || lastCall.counter !== client.id}
                  className="w-full py-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 rounded-2xl font-semibold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Volume2 className="w-5 h-5" />
                  PANGGIL ULANG
                </button>
              </div>
            </div>

            <div className="px-8 py-6 bg-zinc-50 border-t border-zinc-100 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-zinc-400" />
                <span className="text-sm text-zinc-500">Total Antrian {client.type}: <span className="font-bold text-zinc-900">{getQueueNumber(client.type)}</span></span>
              </div>
              <div className="text-xs text-zinc-400 font-mono">
                ID: COUNTER_{client.id}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return null;
}

function ClockDisplay() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="text-2xl font-bold font-mono tracking-tighter">
      {time.toLocaleTimeString('id-ID', { hour12: false })}
    </div>
  );
}
