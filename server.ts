import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { GameState, Player, Question } from "./src/types";

const QUESTIONS: Question[] = [
  {
    id: "1",
    text: "What does HTML stand for?",
    options: ["Hyper Text Markup Language", "High Tech Modern Language", "Hyperlink and Text Management", "Home Tool Markup Language"],
    correctAnswer: 0
  },
  {
    id: "2",
    text: "Which language is primarily used for styling web pages?",
    options: ["Python", "JavaScript", "CSS", "SQL"],
    correctAnswer: 2
  },
  {
    id: "3",
    text: "What is the correct way to write a JavaScript array?",
    options: ["var colors = (1:'red', 2:'blue')", "var colors = ['red', 'green', 'blue']", "var colors = 'red', 'green', 'blue'", "var colors = 1 = ('red'), 2 = ('green')"],
    correctAnswer: 1
  },
  {
    id: "4",
    text: "Which of these is NOT a JavaScript framework/library?",
    options: ["React", "Vue", "Django", "Angular"],
    correctAnswer: 2
  },
  {
    id: "5",
    text: "What does SQL stand for?",
    options: ["Strong Question Language", "Structured Query Language", "Simple Query Language", "System Query Language"],
    correctAnswer: 1
  },
  {
    id: "6",
    text: "In Python, how do you start a comment?",
    options: ["//", "/*", "#", "--"],
    correctAnswer: 2
  },
  {
    id: "7",
    text: "Which HTTP method is used to update an existing resource?",
    options: ["GET", "POST", "PUT", "DELETE"],
    correctAnswer: 2
  },
  {
    id: "8",
    text: "What is the purpose of 'git clone'?",
    options: ["To delete a repository", "To create a copy of a repository", "To merge two branches", "To push changes to a server"],
    correctAnswer: 1
  }
];

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;
  const rooms: Map<string, GameState> = new Map();

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("joinRoom", (name: string, roomId?: string) => {
      let targetRoomId = roomId || "lobby";
      
      if (!rooms.has(targetRoomId)) {
        rooms.set(targetRoomId, {
          roomId: targetRoomId,
          players: [],
          status: 'waiting',
          currentQuestionIndex: 0,
          questionStartTime: 0,
          questions: QUESTIONS.sort(() => Math.random() - 0.5).slice(0, 5)
        });
      }

      const room = rooms.get(targetRoomId)!;
      
      if (room.status !== 'waiting') {
        socket.emit("error", "Game already in progress");
        return;
      }

      const newPlayer: Player = {
        id: socket.id,
        name: name || `Player ${room.players.length + 1}`,
        score: 0,
        isReady: false
      };

      room.players.push(newPlayer);
      socket.join(targetRoomId);
      io.to(targetRoomId).emit("roomState", room);
    });

    socket.on("setReady", (ready: boolean) => {
      for (const [roomId, room] of rooms.entries()) {
        const player = room.players.find(p => p.id === socket.id);
        if (player) {
          player.isReady = ready;
          
          // Check if all ready
          if (room.players.length >= 2 && room.players.every(p => p.isReady)) {
            room.status = 'starting';
            io.to(roomId).emit("roomState", room);
            
            setTimeout(() => {
              room.status = 'playing';
              room.currentQuestionIndex = 0;
              room.questionStartTime = Date.now();
              io.to(roomId).emit("roomState", room);
            }, 3000);
          } else {
            io.to(roomId).emit("roomState", room);
          }
          break;
        }
      }
    });

    socket.on("submitAnswer", (answerIndex: number) => {
      for (const [roomId, room] of rooms.entries()) {
        const player = room.players.find(p => p.id === socket.id);
        if (player && room.status === 'playing') {
          const question = room.questions[room.currentQuestionIndex];
          const isCorrect = answerIndex === question.correctAnswer;
          
          if (isCorrect && !player.lastAnswerTime) {
            const timeTaken = Date.now() - room.questionStartTime;
            // Faster answer = more points (max 1000, min 100)
            const points = Math.max(100, 1000 - Math.floor(timeTaken / 10));
            player.score += points;
            player.lastAnswerCorrect = true;
          } else {
            player.lastAnswerCorrect = false;
          }
          player.lastAnswerTime = Date.now();

          // Check if all players answered
          if (room.players.every(p => p.lastAnswerTime)) {
            if (room.currentQuestionIndex < room.questions.length - 1) {
              setTimeout(() => {
                room.currentQuestionIndex++;
                room.questionStartTime = Date.now();
                room.players.forEach(p => {
                  p.lastAnswerTime = undefined;
                  p.lastAnswerCorrect = undefined;
                });
                io.to(roomId).emit("roomState", room);
              }, 2000);
            } else {
              room.status = 'finished';
              room.winner = [...room.players].sort((a, b) => b.score - a.score)[0];
              io.to(roomId).emit("roomState", room);
              
              // Reset room after 10 seconds
              setTimeout(() => {
                rooms.delete(roomId);
              }, 10000);
            }
          }
          
          io.to(roomId).emit("roomState", room);
          break;
        }
      }
    });

    socket.on("disconnect", () => {
      for (const [roomId, room] of rooms.entries()) {
        const index = room.players.findIndex(p => p.id === socket.id);
        if (index !== -1) {
          room.players.splice(index, 1);
          if (room.players.length === 0) {
            rooms.delete(roomId);
          } else {
            io.to(roomId).emit("roomState", room);
          }
          break;
        }
      }
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
