const quotes = [
    "Stay hungry, stay foolish.",
    "The only limit to our realization of tomorrow is our doubts of today.",
    "Life is short. Code more.",
    "Believe you can and you're halfway there."
];
document.getElementById('quote').textContent =
    quotes[Math.floor(Math.random() * quotes.length)];
function updateClock() {
    const now = new Date();
    document.getElementById('clock').textContent = now.toLocaleTimeString();
}
setInterval(updateClock, 1000);
updateClock();
function sayHi() {
    const greetings = [
        "Hi there, fellow coder!",
        "Nice to meet you!",
        "你好，朋友！",
        "Welcome to my homepage!",
        "愿我们在AI的世界里相遇~"
    ];
    const msg = greetings[Math.floor(Math.random() * greetings.length)];
    document.getElementById("greet-result").textContent = msg;
}
function voteMood(emoji) {
    document.getElementById("mood-thanks").textContent = "You chose.：" + emoji + "，Thank you for your feedback！";
}