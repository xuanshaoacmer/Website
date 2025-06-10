const socket = io();

const usernameInput = document.getElementById("username");
const joinBtn = document.getElementById("joinBtn");
const playerList = document.getElementById("players");
const loginSection = document.getElementById("login-container");
const playerSection = document.getElementById("player-list");

let ownusername = "";
let currentRoom = null;
const challengedUsers = new Set();
let answeredCurrentQuestion = false;
let selectedAnswer = null;

const challengeOverlay = document.getElementById("challengeOverlay"); 
const challengeText = document.getElementById("challengeText");
const acceptBtn = document.getElementById("acceptBtn");
const rejectBtn = document.getElementById("rejectBtn");


let challenger = "";  

joinBtn.addEventListener("click", () => {
  const name = usernameInput.value.trim().toLowerCase();
  if (name) {
    ownusername = name;
    socket.emit("join", name);
    loginSection.classList.add("hidden");
    playerSection.classList.remove("hidden");
  }
});

socket.on("updatePlayers", (players) => {
  playerList.innerHTML = "";

  players.forEach((player) => {
    const userCard = document.createElement("div");
    userCard.classList.add("user-card");

    const nameSpan = document.createElement("span");
    nameSpan.textContent = player;

    if (player === ownusername) {
      nameSpan.textContent += " (You)";
      nameSpan.style.color = "orange";
      nameSpan.style.fontWeight = "bold";
      userCard.appendChild(nameSpan);
    } else {
      nameSpan.style.color = "blue";
      nameSpan.style.fontWeight = "bold";

      const challengeBtn = document.createElement("button");
      challengeBtn.textContent = "Challenge";
      challengeBtn.classList.add("challenge-btn");

      challengeBtn.addEventListener("click", () => {
        if (challengedUsers.has(player)) return;
        challengedUsers.add(player);
        alert(`Challenge sent to ${player}`);
        console.log(`Sending challenge to: ${player}`);  

        socket.emit("challenge", player.toLowerCase().trim());
      });

      userCard.appendChild(nameSpan);
      userCard.appendChild(challengeBtn);
    }

    playerList.appendChild(userCard);
  });
});

socket.on("challenged", (opponent) => {
  challenger = opponent.toLowerCase().trim();
  challengeText.textContent = `Player ${opponent} wants to challenge you. Do you accept?`;
  challengeOverlay.classList.remove("hidden");
});

acceptBtn.addEventListener("click", () => {
  socket.emit("acceptChallenge", challenger);
  challengeOverlay.classList.add("hidden");
});

rejectBtn.addEventListener("click", () => {
  socket.emit("rejectChallenge", challenger);
  challengeOverlay.classList.add("hidden");
});


function showChallengeModal(playerName) {
  const overlay = document.getElementById("challengeOverlay");
  const message = overlay.querySelector("p");
  message.textContent = `Player ${playerName} wants to challenge you. Do you accept?`;

  overlay.classList.remove("hidden");
}


function hideChallengeModal() {
  document.getElementById("challengeOverlay").classList.add("hidden");
}


socket.on("startGame", ({ room, question }) => {
  currentRoom = room;


  document.querySelector(".main-left").style.display = "none";
  document.querySelector(".main-right").style.display = "block";


  document.getElementById("question-container").style.display = "block";


  document.getElementById("your-score").textContent = "0";
  document.getElementById("opponent-score").textContent = "0";


  showQuestion(question);
});


socket.on("nextQuestion", ({ question }) => {
  showQuestion(question);
});

socket.on("answerResult", ({ scores, round, winnerThisRound, correctAnswer: correctAnswerFromServer }) => {

  updateScores(scores);

  const me = ownusername.toLowerCase().trim();
  const roundKeys = Object.keys(round);
  const myKey = roundKeys.find(n => n.toLowerCase().trim() === me);
  const opponentKey = roundKeys.find(n => n.toLowerCase().trim() !== me);

  const myResult = round[myKey];
  const oppResult = round[opponentKey];

  const status = document.getElementById("status");

  if (!myResult) {
    status.textContent = "❌ No data of your answer was found";
    return;
  }


  if (!myResult?.hasAnswered && !oppResult?.hasAnswered) {
    status.textContent = "⏰ Neither side provided an answer (0 points)";
  } else if (myResult?.isCorrect && winnerThisRound === myKey) {
    status.textContent = "✅ You got it right and did it faster! (+2 points)";
  } else if (myResult?.isCorrect && winnerThisRound !== myKey) {
    status.textContent = "✅ You got it right, but slower than your opponent (0 points)";
  } else if (!myResult?.isCorrect && oppResult?.isCorrect) {
    status.textContent = "❌ You answered incorrectly. Your opponent has scored (+2 points).";
  } else {
    status.textContent = "⚠️ Both parties got the answer wrong (0 points)";
  }


  let correctAnswer = correctAnswerFromServer || "";


  const optionButtons = document.querySelectorAll("#options button");

  const correct = correctAnswer.trim().toLowerCase();
  const selected = selectedAnswer.trim().toLowerCase();

  optionButtons.forEach(btn => {
    const text = btn.textContent.trim().toLowerCase();
    const correct = correctAnswer.trim().toLowerCase();
    const selected = selectedAnswer?.trim().toLowerCase();


    btn.style.backgroundColor = "#f0f0f0";
    btn.style.color = "#000";


    if (text === correct) {
      btn.style.backgroundColor = "#4CAF50";
      btn.style.color = "#fff";
    }


    if (text === selected && !myResult.isCorrect) {
      btn.style.backgroundColor = "#f44336";
      btn.style.color = "#fff";
    }

    btn.disabled = true;
  });

  const correctDisplay = document.createElement("div");
  correctDisplay.className = "correct-answer-tip";
  correctDisplay.style.marginTop = "12px";
  correctDisplay.style.fontSize = "16px";
  correctDisplay.style.color = "#333";
  correctDisplay.textContent = `✅ The correct answer is：${correctAnswer}`;
  document.getElementById("question-container").appendChild(correctDisplay);

});

socket.on("gameOver", ({ scores, winner }) => {
  document.getElementById("status").textContent =
    `🎉 The game is over! The winner is：${winner}`;
  updateScores(scores);


  document.getElementById("backToLobbyBtn").style.display = "inline-block";
});


function showQuestion(q) {
  console.log("🎯 Loading the question：", q);

  const prevTips = document.querySelectorAll("#question-container .correct-answer-tip");
  prevTips.forEach(el => el.remove());

  const questionEl = document.getElementById("question");
  const optionsEl = document.getElementById("options");
  const statusEl = document.getElementById("status");
  answeredCurrentQuestion = false;


  questionEl.textContent = q.question || "⚠️ 无效题目";
  optionsEl.innerHTML = "";
  statusEl.textContent = "Waiting for your answer...";


  if (!Array.isArray(q.options)) {
    optionsEl.innerHTML = "<p style='color:red;'>⚠️ 本题没有选项</p>";
    return;
  }


  q.options.forEach(opt => {
    const btn = document.createElement("button");
    btn.textContent = opt;
    btn.dataset.answer = opt; 
    btn.classList.add("option-button");

    btn.style.margin = "5px";
    btn.style.padding = "10px 20px";
    btn.style.border = "1px solid #ccc";
    btn.style.borderRadius = "6px";
    btn.style.cursor = "pointer";
    btn.style.backgroundColor = "#f0f0f0";

    btn.onclick = () => {
      if (answeredCurrentQuestion) return;

      selectedAnswer = opt;


      optionsEl.querySelectorAll("button").forEach(b => {
        b.style.backgroundColor = "#f0f0f0";
        b.style.fontWeight = "normal";
      });


      btn.style.backgroundColor = "#d0eaff";
      btn.style.fontWeight = "bold";
    };
    optionsEl.appendChild(btn);
  });


  startTimer(30);
}

let countdownInterval;

function startTimer(seconds) {
  const timerEl = document.getElementById("timer-value");
  const progressBar = document.getElementById("timer-progress");

  if (!timerEl || !progressBar) {
    console.error("❌ Timer elements not found!");
    return;
  }

  clearInterval(countdownInterval);

  let remaining = seconds;
  timerEl.textContent = `${remaining} seconds`;

  progressBar.style.width = "100%";

  countdownInterval = setInterval(() => {
    remaining--;

    timerEl.textContent = remaining;
    progressBar.style.width = `${(remaining / seconds) * 100}%`;

    if (remaining <= 0) {
      clearInterval(countdownInterval);
      timerEl.textContent = "0";
      progressBar.style.width = "0%";

      if (!answeredCurrentQuestion) {
        document.querySelectorAll("#options button").forEach(b => b.disabled = true);
        answeredCurrentQuestion = true;

        socket.emit("answer", {
          room: currentRoom,
          answer: null  
        });

      }
    }
  }, 1000);
}



function updateScores(scores) {
  const me = ownusername.toLowerCase().trim();
  const [p1, p2] = Object.keys(scores);

  const myScore = scores[me] || 0;
  const opponent = p1 === me ? p2 : p1;
  const oppScore = scores[opponent] || 0;

  document.getElementById("your-score").textContent = myScore;
  document.getElementById("opponent-score").textContent = oppScore;
}

document.getElementById("submit-answer-btn").onclick = () => {
  if (answeredCurrentQuestion || !selectedAnswer) {
    alert("Please select an answer first.");
    return;
  }

  answeredCurrentQuestion = true;

  socket.emit("answer", {
    room: currentRoom,
    answer: selectedAnswer 
  });


  document.querySelectorAll("#options button").forEach(b => b.disabled = true);

  document.getElementById("status").textContent = "Answer submitted. Waiting for opponent...";
};

socket.on("opponentLeft", () => {
  console.warn("⚠️ 对手已退出游戏");

  currentRoom = null;
  selectedAnswer = null;
  answeredCurrentQuestion = false;


  document.querySelector(".main-right").style.display = "none";
  document.querySelector(".main-left").style.display = "block";


  document.getElementById("user-info").style.display = "block";
  document.getElementById("login-form").style.display = "none";


  document.getElementById("question-container").style.display = "none";
  document.getElementById("result-container").style.display = "none";
  document.getElementById("final-result").style.display = "none";


  document.getElementById("options").innerHTML = "";


  document.getElementById("your-score").textContent = "0";
  document.getElementById("opponent-score").textContent = "0";


  document.getElementById("status").textContent = "";
  document.getElementById("backToLobbyBtn").style.display = "inline-block";
});

function returnToLobby() {
 
  if (currentRoom) socket.emit("leaveRoom", currentRoom);


  currentRoom = null;
  selectedAnswer = null;
  answeredCurrentQuestion = false;
  clearInterval(countdownInterval);


  document.querySelector(".main-right").style.display = "none";
  document.querySelector(".main-left").style.display = "block";


  loginSection.classList.add("hidden");
  playerSection.classList.remove("hidden");


  document.getElementById("your-score").textContent = "0";
  document.getElementById("opponent-score").textContent = "0";
  document.getElementById("question").textContent = "";
  document.getElementById("options").innerHTML = "";
  document.getElementById("status").textContent = "";


  document.querySelectorAll("#question-container .correct-answer-tip")
    .forEach(el => el.remove());


  document.getElementById("backToLobbyBtn").style.display = "none";
}
const backToLobbyBtn = document.getElementById("backToLobbyBtn");
backToLobbyBtn.onclick = () => {
  if (currentRoom) {
    socket.emit("leaveRoom", currentRoom);
  }

  const modal = document.getElementById("opponentLeftModal");
  if (modal) modal.classList.add("hidden");

  returnToLobby();
};


