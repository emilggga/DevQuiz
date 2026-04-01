export interface Question {
  id: string;
  text: string;
  options: string[];
  correctAnswer: number;
}

export interface Player {
  id: string;
  name: string;
  score: number;
  isReady: boolean;
  lastAnswerCorrect?: boolean;
  lastAnswerTime?: number;
}

export interface GameState {
  roomId: string;
  players: Player[];
  status: 'waiting' | 'starting' | 'playing' | 'finished';
  currentQuestionIndex: number;
  questionStartTime: number;
  questions: Question[];
  winner?: Player;
}

export interface ServerToClientEvents {
  roomState: (state: GameState) => void;
  gameStarted: (questions: Question[]) => void;
  nextQuestion: (index: number) => void;
  gameOver: (winner: Player) => void;
  error: (message: string) => void;
}

export interface ClientToServerEvents {
  joinRoom: (name: string, roomId?: string) => void;
  setReady: (ready: boolean) => void;
  submitAnswer: (answerIndex: number) => void;
}
