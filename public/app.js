const greetings = [
  "Hello, World!",
  "Hallo, Welt!",
  "Bonjour, le monde !",
  "Hola, mundo!",
  "Ciao, mondo!",
  "こんにちは世界",
];

let index = 0;

document.getElementById("greet").addEventListener("click", () => {
  index = (index + 1) % greetings.length;
  document.getElementById("output").textContent = greetings[index];
});
