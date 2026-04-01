import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Users, Timer, CheckCircle2, XCircle, Play, LogIn, Crown, ListOrdered, LogOut } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GameState, Player, Question } from './types';
import { db, collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp, auth, onAuthStateChanged, signInWithGoogle, handleFirestoreError, OperationType } from './firebase';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface LeaderboardEntry {
  id: string;
  playerName: string;
  score: number;
  timestamp: any;
}

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState('');
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [user, setUser] = useState(auth.currentUser);
  const [isConnected, setIsConnected] = useState(false);
  const scoreSavedRef = useRef(false);

  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
    });

    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u?.displayName && !name) {
        setName(u.displayName);
      }
    });

    newSocket.on('roomState', (state: GameState) => {
      setGameState(state);
      
      // Reset selected answer when question changes
      if (state.status === 'playing') {
        const currentPlayer = state.players.find(p => p.id === newSocket.id);
        if (!currentPlayer?.lastAnswerTime) {
          setSelectedAnswer(null);
        }
        scoreSavedRef.current = false;
      }

      // Save score to Firebase when game finishes
      if (state.status === 'finished' && !scoreSavedRef.current) {
        const currentPlayer = state.players.find(p => p.id === newSocket.id);
        if (currentPlayer && currentPlayer.score > 0 && auth.currentUser) {
          saveScore(currentPlayer.name, currentPlayer.score);
          scoreSavedRef.current = true;
        }
      }
    });

    newSocket.on('error', (msg: string) => {
      setError(msg);
      setJoined(false); // Reset joined state on error
      setTimeout(() => setError(''), 3000);
    });

    // Listen to global leaderboard
    const q = query(collection(db, 'leaderboard'), orderBy('score', 'desc'), limit(10));
    const unsubscribeLeaderboard = onSnapshot(q, (snapshot) => {
      const entries: LeaderboardEntry[] = [];
      snapshot.forEach((doc) => {
        entries.push({ id: doc.id, ...doc.data() } as LeaderboardEntry);
      });
      setLeaderboard(entries);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'leaderboard');
    });

    return () => {
      newSocket.close();
      unsubscribeAuth();
      unsubscribeLeaderboard();
    };
  }, []);

  const saveScore = async (playerName: string, score: number) => {
    try {
      await addDoc(collection(db, 'leaderboard'), {
        playerName,
        score,
        timestamp: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'leaderboard');
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      setError("Login failed. Please try again.");
    }
  };

  const handleLogout = () => {
    auth.signOut();
  };

  const generateRoomId = () => {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
  };

  const handleCreateRoom = () => {
    if (!isConnected) {
      setError('Connecting to server...');
      return;
    }
    if (!name.trim()) {
      setError('Please enter your name first');
      return;
    }
    const newId = generateRoomId();
    socket?.emit('joinRoom', name, newId);
    setJoined(true);
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected) {
      setError('Connecting to server...');
      return;
    }
    if (!name.trim()) {
      setError('Please enter your name first');
      return;
    }
    if (!roomId.trim()) {
      setError('Please enter a Room ID');
      return;
    }
    socket?.emit('joinRoom', name, roomId.toUpperCase());
    setJoined(true);
  };

  const handleReady = () => {
    const currentPlayer = gameState?.players.find(p => p.id === socket?.id);
    socket?.emit('setReady', !currentPlayer?.isReady);
  };

  const handleAnswer = (index: number) => {
    if (selectedAnswer !== null) return;
    setSelectedAnswer(index);
    socket?.emit('submitAnswer', index);
  };

  if (!joined) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-[#141414] border border-[#262626] rounded-2xl p-8 shadow-2xl"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center mb-4 rotate-3 shadow-lg shadow-orange-500/20">
              <Trophy className="text-white w-8 h-8" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-center">DevQuiz</h1>
            <p className="text-gray-400 text-sm mt-2">Multiplayer Programming Challenge</p>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 ml-1">Your Profile</label>
              <div className="flex items-center gap-2">
                {!isConnected && (
                  <span className="text-[10px] text-yellow-500 animate-pulse">Connecting...</span>
                )}
                {user ? (
                  <button onClick={handleLogout} className="text-[10px] text-gray-500 hover:text-white flex items-center gap-1 transition-colors">
                    <LogOut className="w-3 h-3" /> Sign Out
                  </button>
                ) : (
                  <button onClick={handleLogin} className="text-[10px] text-orange-500 hover:text-orange-400 font-bold flex items-center gap-1 transition-colors">
                    <LogIn className="w-3 h-3" /> Sign In with Google
                  </button>
                )}
              </div>
            </div>

            <div>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your nickname"
                  className="w-full bg-[#1a1a1a] border border-[#262626] rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:border-orange-500 transition-colors"
                  required
                />
              </div>
              {!user && (
                <p className="text-[10px] text-gray-600 mt-2 italic">* Sign in to save your scores to the global leaderboard</p>
              )}
            </div>

            {!isJoining ? (
              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={handleCreateRoom}
                  disabled={!isConnected}
                  className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all transform active:scale-95 shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2"
                >
                  Create New Room
                  <Play className="w-4 h-4 fill-current" />
                </button>
                <button
                  onClick={() => setIsJoining(true)}
                  disabled={!isConnected}
                  className="w-full bg-[#1a1a1a] border border-[#262626] hover:border-gray-600 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all transform active:scale-95 flex items-center justify-center gap-2"
                >
                  Join Existing Room
                  <LogIn className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowLeaderboard(!showLeaderboard)}
                  className="w-full bg-[#1a1a1a] border border-[#262626] text-gray-400 font-bold py-3 rounded-xl hover:bg-[#202020] transition-colors flex items-center justify-center gap-2"
                >
                  <ListOrdered className="w-4 h-4" />
                  {showLeaderboard ? "Hide Leaderboard" : "Global Leaderboard"}
                </button>
              </div>
            ) : (
              <motion.form 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                onSubmit={handleJoinRoom} 
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5 ml-1">Room ID</label>
                  <div className="relative">
                    <LogIn className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="text"
                      value={roomId}
                      onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                      placeholder="Enter 4-char code"
                      className="w-full bg-[#1a1a1a] border border-[#262626] rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:border-orange-500 transition-colors font-mono"
                      maxLength={6}
                      autoFocus
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setIsJoining(false)}
                    className="bg-[#1a1a1a] border border-[#262626] text-gray-400 font-bold py-3 rounded-xl hover:bg-[#202020] transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={!isConnected}
                    className="bg-orange-500 hover:bg-orange-600 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-orange-500/20"
                  >
                    Join
                  </button>
                </div>
              </motion.form>
            )}

            {showLeaderboard && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-6 pt-6 border-t border-[#262626]"
              >
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4 flex items-center gap-2">
                  <Crown className="w-3 h-3 text-orange-500" />
                  Top 10 Global
                </h3>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                  {leaderboard.length > 0 ? leaderboard.map((entry, idx) => (
                    <div key={entry.id} className="flex items-center justify-between text-sm py-1">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-600 font-mono w-4">{idx + 1}.</span>
                        <span className="font-medium truncate max-w-[120px]">{entry.playerName}</span>
                      </div>
                      <span className="text-orange-500 font-bold font-mono">{entry.score}</span>
                    </div>
                  )) : (
                    <p className="text-gray-600 text-xs text-center py-4 italic">No scores yet. Be the first!</p>
                  )}
                </div>
              </motion.div>
            )}
          </div>

          {error && (
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-red-500 text-center mt-4 text-sm font-medium"
            >
              {error}
            </motion.p>
          )}
        </motion.div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-4 font-sans">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-400 animate-pulse">Entering room...</p>
        <button 
          onClick={() => setJoined(false)}
          className="mt-8 text-xs text-gray-500 hover:text-white underline"
        >
          Cancel
        </button>
      </div>
    );
  }

  const currentPlayer = gameState.players.find(p => p.id === socket?.id);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Players Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-[#141414] border border-[#262626] rounded-2xl p-6">
            <div className="mb-6">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500">Room ID</h2>
                <span className="text-orange-500 font-mono font-bold">{gameState.roomId}</span>
              </div>
              <div className="h-px bg-[#262626] w-full" />
            </div>

            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500">Players</h2>
              <span className="bg-[#1a1a1a] px-2 py-1 rounded text-xs font-mono">{gameState.players.length}</span>
            </div>
            <div className="space-y-3">
              {gameState.players.map((player) => (
                <div 
                  key={player.id}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-xl border transition-all",
                    player.id === socket?.id ? "bg-orange-500/10 border-orange-500/30" : "bg-[#1a1a1a] border-[#262626]"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold",
                      player.id === socket?.id ? "bg-orange-500 text-white" : "bg-[#262626] text-gray-400"
                    )}>
                      {player.name[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold truncate max-w-[100px]">{player.name}</p>
                      <p className="text-[10px] text-gray-500 font-mono">{player.score} pts</p>
                    </div>
                  </div>
                  {player.isReady && gameState.status === 'waiting' && (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  )}
                  {player.lastAnswerTime && gameState.status === 'playing' && (
                    <div className={cn(
                      "w-2 h-2 rounded-full animate-pulse",
                      player.lastAnswerCorrect ? "bg-green-500" : "bg-red-500"
                    )} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {gameState.status === 'waiting' && (
            <button
              onClick={handleReady}
              className={cn(
                "w-full py-4 rounded-xl font-bold transition-all transform active:scale-95",
                currentPlayer?.isReady 
                  ? "bg-gray-800 text-gray-400 hover:bg-gray-700" 
                  : "bg-green-600 text-white hover:bg-green-700 shadow-lg shadow-green-600/20"
              )}
            >
              {currentPlayer?.isReady ? "Waiting for others..." : "I'm Ready!"}
            </button>
          )}
        </div>

        {/* Main Game Area */}
        <div className="lg:col-span-3">
          <AnimatePresence mode="wait">
            {gameState.status === 'waiting' && (
              <motion.div 
                key="waiting"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                className="h-full bg-[#141414] border border-[#262626] rounded-3xl p-12 flex flex-col items-center justify-center text-center"
              >
                <div className="w-20 h-20 bg-[#1a1a1a] rounded-full flex items-center justify-center mb-6 animate-bounce">
                  <Users className="w-10 h-10 text-orange-500" />
                </div>
                <h2 className="text-4xl font-bold mb-4">Waiting for Players</h2>
                <p className="text-gray-400 max-w-md">
                  Invite friends to join room <code className="bg-[#1a1a1a] px-2 py-1 rounded text-orange-500 font-mono">{gameState.roomId}</code>. 
                  Need at least 2 players to start!
                </p>
              </motion.div>
            )}

            {gameState.status === 'starting' && (
              <motion.div 
                key="starting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full bg-[#141414] border border-[#262626] rounded-3xl p-12 flex flex-col items-center justify-center text-center"
              >
                <motion.div 
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                  className="text-8xl font-black text-orange-500 mb-8"
                >
                  GET READY
                </motion.div>
                <p className="text-xl text-gray-400">Game starting in 3 seconds...</p>
              </motion.div>
            )}

            {gameState.status === 'playing' && (
              <motion.div 
                key="playing"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="bg-[#141414] border border-[#262626] rounded-3xl p-8 md:p-12">
                  <div className="flex items-center justify-between mb-8">
                    <span className="bg-orange-500/10 text-orange-500 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest border border-orange-500/20">
                      Question {gameState.currentQuestionIndex + 1} / {gameState.questions.length}
                    </span>
                    <div className="flex items-center gap-2 text-gray-400">
                      <Timer className="w-4 h-4" />
                      <span className="font-mono text-sm">Real-time</span>
                    </div>
                  </div>

                  <h3 className="text-2xl md:text-3xl font-bold leading-tight mb-12">
                    {gameState.questions[gameState.currentQuestionIndex].text}
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {gameState.questions[gameState.currentQuestionIndex].options.map((option, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleAnswer(idx)}
                        disabled={selectedAnswer !== null}
                        className={cn(
                          "p-6 rounded-2xl border-2 text-left transition-all group relative overflow-hidden",
                          selectedAnswer === null 
                            ? "bg-[#1a1a1a] border-[#262626] hover:border-orange-500/50 hover:bg-[#202020]" 
                            : selectedAnswer === idx 
                              ? "bg-orange-500/20 border-orange-500" 
                              : "bg-[#1a1a1a] border-[#262626] opacity-50 cursor-not-allowed"
                        )}
                      >
                        <div className="flex items-center gap-4">
                          <span className="w-8 h-8 rounded-lg bg-[#262626] flex items-center justify-center text-xs font-bold group-hover:bg-orange-500 group-hover:text-white transition-colors">
                            {String.fromCharCode(65 + idx)}
                          </span>
                          <span className="font-medium">{option}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Feedback Overlay */}
                {currentPlayer?.lastAnswerTime && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "p-4 rounded-2xl flex items-center justify-center gap-3 font-bold",
                      currentPlayer.lastAnswerCorrect ? "bg-green-500/10 text-green-500 border border-green-500/20" : "bg-red-500/10 text-red-500 border border-red-500/20"
                    )}
                  >
                    {currentPlayer.lastAnswerCorrect ? (
                      <><CheckCircle2 className="w-5 h-5" /> Correct! Waiting for others...</>
                    ) : (
                      <><XCircle className="w-5 h-5" /> Incorrect! Better luck next time.</>
                    )}
                  </motion.div>
                )}
              </motion.div>
            )}

            {gameState.status === 'finished' && (
              <motion.div 
                key="finished"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="h-full bg-[#141414] border border-[#262626] rounded-3xl p-12 flex flex-col items-center justify-center text-center"
              >
                <div className="relative mb-8">
                  <div className="w-24 h-24 bg-orange-500 rounded-3xl flex items-center justify-center rotate-6 shadow-2xl shadow-orange-500/40">
                    <Crown className="w-12 h-12 text-white" />
                  </div>
                  <motion.div 
                    animate={{ scale: [1, 1.5, 1], opacity: [0, 1, 0] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="absolute inset-0 bg-orange-500 rounded-3xl -z-10"
                  />
                </div>
                
                <h2 className="text-5xl font-black mb-2">GAME OVER</h2>
                <p className="text-gray-400 mb-8 uppercase tracking-[0.2em] text-sm">Final Standings</p>

                <div className="w-full max-w-md space-y-3 mb-12">
                  {gameState.players.sort((a, b) => b.score - a.score).map((p, idx) => (
                    <div key={p.id} className={cn(
                      "flex items-center justify-between p-4 rounded-2xl border",
                      idx === 0 ? "bg-orange-500/10 border-orange-500/30" : "bg-[#1a1a1a] border-[#262626]"
                    )}>
                      <div className="flex items-center gap-4">
                        <span className="text-lg font-black text-gray-500 w-6">#{idx + 1}</span>
                        <span className="font-bold">{p.name}</span>
                      </div>
                      <span className="font-mono font-bold text-orange-500">{p.score}</span>
                    </div>
                  ))}
                </div>

                <p className="text-gray-500 text-xs animate-pulse">Room will reset in a few seconds...</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
