import confetti from "canvas-confetti";

export function fireConfetti() {
  // Classical Chinese gold, cinnabar, jade, bamboo palette
  const colors = ["#9E2A2B", "#D4AF37", "#2C4F3D", "#E09F3E", "#A44A3F"];

  confetti({
    particleCount: 80,
    spread: 70,
    origin: { y: 0.6 },
    colors
  });

  setTimeout(() => {
    confetti({
      particleCount: 50,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors
    });
  }, 200);

  setTimeout(() => {
    confetti({
      particleCount: 50,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors
    });
  }, 400);
}
