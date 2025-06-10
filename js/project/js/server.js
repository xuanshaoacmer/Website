const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const fs = require("fs");
const path = require("path");

const questionsPath = path.join(__dirname, "../data/questions.json");
const questions = JSON.parse(fs.readFileSync(questionsPath, "utf8"));

app.use(express.static("project"));

let players = [];
const roomStates = {};

io.on("connection", (socket) => {
  socket.on("join", (name) => {
    const cleanName = name.toLowerCase().trim();
    socket.username = cleanName;
    if (!players.includes(cleanName)) players.push(cleanName);
    io.emit("updatePlayers", players);
  });
socket.on("leaveRoom", (room) => {
    if (!room) return;
    // 1) 把 socket 踢出房间
    socket.leave(room);

    // 2) 更新 roomStates
    const state = roomStates[room];
    if (!state) return;
    state.players = state.players.filter(p => p !== socket.username);

    // 3) 通知还在房间里的那一位
    socket.to(room).emit("opponentLeft");

    // 4) 如果房间空了，彻底删除它
    if (state.players.length === 0) {
      delete roomStates[room];
      console.log(`[ROOM CLEARED] ${room} (manual leave)`);
    }
  });
  socket.on("disconnect", () => {
    const username = socket.username;
    if (!username) return;

    players = players.filter(p => p !== username);
    io.emit("updatePlayers", players);

    for (const room in roomStates) {
      const state = roomStates[room];
      if (state.players.includes(username)) {
        const otherPlayer = state.players.find(p => p !== username);

        const opponentSocket = [...io.sockets.sockets.values()].find(
          s => s.username === otherPlayer
        );

        if (opponentSocket) {
          opponentSocket.emit("opponentLeft");
          console.log(`[DISCONNECT] Notified ${otherPlayer} that ${username} left`);
        } else {
          console.log(`[DISCONNECT] Opponent ${otherPlayer} not found`);
        }

        delete roomStates[room];
        console.log(`[ROOM CLEARED] ${room}`);
        break;
      }
    }
  });





  // 修复后的 challenge 逻辑
  socket.on("challenge", (opponentName) => {
    const cleanOpponent = opponentName.toLowerCase().trim();
    const opponentSocket = [...io.sockets.sockets.values()].find(
      s => s.username && s.username.toLowerCase().trim() === cleanOpponent
    );

    if (opponentSocket) {
      opponentSocket.emit("challenged", socket.username);
      console.log(`[CHALLENGE] ${socket.username} -> ${opponentSocket.username}`);  // 调试日志
    } else {
      console.log(`[CHALLENGE FAILED] Opponent ${opponentName} not found.`);  // 调试日志
    }
  });

  socket.on("acceptChallenge", (opponentName) => {
    const cleanOpponent = opponentName.toLowerCase().trim();
    const opponentSocket = [...io.sockets.sockets.values()].find(
      s => s.username && s.username.toLowerCase().trim() === cleanOpponent
    );

    if (!opponentSocket) {
      console.log(`[ACCEPT FAILED] Opponent ${opponentName} not found.`);  // 调试日志
      return;
    }
    const players = [socket.username, opponentSocket.username].sort();
    const room = `room_${players[0]}_${players[1]}`;

    socket.join(room);
    opponentSocket.join(room);
    roomStates[room] = {
      players,
      scores: { [players[0]]: 0, [players[1]]: 0 },
      currentQuestion: 0,
      answers: {},
      answersEvaluated: {}
    };

    console.log(`[ROOM CREATED] ${room} between ${players[0]} and ${players[1]}`);  // 调试日志

    io.to(room).emit("startGame", {
      room,
      question: questions[0]
    });
  });

  socket.on("rejectChallenge", (opponentName) => {
    const cleanOpponent = opponentName.toLowerCase().trim();
    const opponentSocket = [...io.sockets.sockets.values()].find(
      s => s.username && s.username.toLowerCase().trim() === cleanOpponent
    );

    if (opponentSocket) {
      opponentSocket.emit("challengeRejected", socket.username);
      console.log(`[REJECT] ${socket.username} rejected challenge from ${opponentSocket.username}`);  // 调试日志
    }
  });

  socket.on("answer", ({ room, answer }) => {
    const gameState = roomStates[room];
    if (!gameState || !socket.username) return;

    const currentQ = gameState.currentQuestion;
    const correctAnswer = questions[currentQ].answer.trim().toLowerCase();
    let isCorrect = false;
    let rawAnswer = answer;

    if (!gameState.answers[currentQ]) gameState.answers[currentQ] = {};
    if (!gameState.answersEvaluated[currentQ]) gameState.answersEvaluated[currentQ] = false;

    if (typeof answer === "string") {
      isCorrect = answer.trim().toLowerCase() === correctAnswer;
    } else {
      rawAnswer = null;
    }

    const timestamp = Date.now();

    // 保存当前玩家答案
    gameState.answers[currentQ][socket.username] = {
      isCorrect,
      timestamp,
      rawAnswer,
      hasAnswered: typeof answer === "string"
    };

    const answers = gameState.answers[currentQ];
    const playerNames = gameState.players;

    if (Object.keys(answers).length === 2) {
      // ✅ 两人都答了，直接计算
      if (!gameState.answersEvaluated[currentQ]) {
        gameState.answersEvaluated[currentQ] = true;
        emitAnswerResult(room, answers, currentQ);
      }
    } else {
      // ✅ 等待对方 30 秒后超时补答
      setTimeout(() => {
        if (gameState.answersEvaluated[currentQ]) return;

        const stillPending = playerNames.filter(p => !answers[p]);
        stillPending.forEach(p => {
          answers[p] = {
            isCorrect: false,
            timestamp: Date.now(),
            rawAnswer: null,
            hasAnswered: false
          };
        });

        gameState.answersEvaluated[currentQ] = true;
        emitAnswerResult(room, answers, currentQ);
      }, 30000);
    }
  });


  function emitAnswerResult(room, answers, currentQ) {
    const gameState = roomStates[room];
    const [p1, p2] = gameState.players;
    const a1 = answers[p1];
    const a2 = answers[p2];

    const scores = { [p1]: 0, [p2]: 0 };
    let winner = "none";

    // 有效判断获胜者和加分
    if (a1.hasAnswered && a2.hasAnswered) {
      if (a1.isCorrect && a2.isCorrect) {
        winner = a1.timestamp < a2.timestamp ? p1 : p2;
        scores[winner] = 2;
      } else if (a1.isCorrect && !a2.isCorrect) {
        scores[p1] = 2;
      } else if (!a1.isCorrect && a2.isCorrect) {
        scores[p2] = 2;
      }
    } else {
      // 至少一方未作答
      if (a1.hasAnswered && a1.isCorrect) scores[p1] = 2;
      if (a2.hasAnswered && a2.isCorrect) scores[p2] = 2;
    }

    // 更新总分
    gameState.scores[p1] += scores[p1];
    gameState.scores[p2] += scores[p2];

    // 向房间内发送结果
    io.to(room).emit("answerResult", {
      scores: gameState.scores,
      round: { [p1]: a1, [p2]: a2 },
      winnerThisRound: winner,
      correctAnswer: questions[currentQ].answer
    });

    // 自动进入下一题（5 秒后）
    setTimeout(() => {
      gameState.currentQuestion++;
      if (gameState.currentQuestion < questions.length) {
        io.to(room).emit("nextQuestion", {
          question: questions[gameState.currentQuestion]
        });
      } else {
        const winner = Object.entries(gameState.scores).sort((a, b) => b[1] - a[1])[0][0];
        io.to(room).emit("gameOver", {
          scores: gameState.scores,
          winner
        });
      }
    }, 5000);
  }
});
http.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
