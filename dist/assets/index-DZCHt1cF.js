import {
  FilesetResolver,
  HandLandmarker,
} from "@mediapipe/tasks-vision";
import * as faceapi from "@vladmandic/face-api/dist/face-api.esm.js";

const HOLD_TIME = 900;
const COOLDOWN_TIME = 1200;
const POINTER_RADIUS = 14;
const FACE_DETECTION_INTERVAL = 12;

const video = document.getElementById("video") as HTMLVideoElement;
const overlay = document.getElementById("overlay") as HTMLCanvasElement;
const ctx = overlay.getContext("2d")!;
const status = document.getElementById("status")!;
const loadingScreen = document.getElementById("loading-screen") as HTMLElement;
const loadingText = document.getElementById("loading-text") as HTMLElement;
const buttons = document.querySelectorAll(".air-btn") as NodeListOf<HTMLElement>;
const faceCard = document.getElementById("face-card") as HTMLElement;
const faceAge = document.getElementById("face-age") as HTMLElement;
const faceGender = document.getElementById("face-gender") as HTMLElement;

let handLandmarker: HandLandmarker | null = null;

const hoverStart: Record<string, number | null> = {};
const lastFired: Record<string, number> = {};

let frameCount = 0;

function resizeCanvas() {
  overlay.width = window.innerWidth;
  overlay.height = window.innerHeight;
}

resizeCanvas();
window.addEventListener("resize", resizeCanvas);

async function startCamera() {
  try {
    video.srcObject = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
  } catch {
    loadingText.textContent =
      "Sin acceso a la cámara. Revisá los permisos.";

    throw new Error("camera-denied");
  }
}

async function loadModels() {
  loadingText.textContent = "Cargando modelo de mano...";

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
  );

  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 1,
  });

  loadingText.textContent = "Cargando modelo de edad...";

  const modelsPath = `${import.meta.env.BASE_URL}models`;

  await faceapi.nets.tinyFaceDetector.loadFromUri(modelsPath);
  await faceapi.nets.ageGenderNet.loadFromUri(modelsPath);
}

async function detectFace() {
  const detection = await faceapi
    .detectSingleFace(
      video,
      new faceapi.TinyFaceDetectorOptions({
        scoreThreshold: 0.4,
      })
    )
    .withAgeAndGender();

  if (detection) {
    const age = Math.round(detection.age);
    const gender =
      detection.gender === "male" ? "Hombre" : "Mujer";
    const probability = Math.round(
      detection.genderProbability * 100
    );

    faceAge.textContent = `~${age} años`;
    faceGender.textContent = `${gender} · ${probability}% confianza`;

    faceCard.classList.remove("hidden");
  } else {
    faceCard.classList.add("hidden");
  }
}

function findButton(x: number, y: number) {
  for (const button of buttons) {
    const rect = button.getBoundingClientRect();

    if (
      x >= rect.left - POINTER_RADIUS &&
      x <= rect.right + POINTER_RADIUS &&
      y >= rect.top - POINTER_RADIUS &&
      y <= rect.bottom + POINTER_RADIUS
    ) {
      return button;
    }
  }

  return null;
}

function drawPointer(
  x: number,
  y: number,
  progress: number
) {
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, 14, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 2;
  ctx.stroke();

  if (progress > 0) {
    ctx.beginPath();
    ctx.arc(
      x,
      y,
      22,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * progress
    );

    ctx.strokeStyle = `rgba(80,220,120,${0.6 + progress * 0.4})`;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.stroke();
  }
}

function fireButton(button: HTMLElement) {
  button.classList.add("fired");
  button.click();

  setTimeout(() => {
    button.classList.remove("fired");
  }, 450);
}

function detectHands() {
  if (!handLandmarker || video.readyState < 2) {
    requestAnimationFrame(detectHands);
    return;
  }

  frameCount++;

  if (frameCount % FACE_DETECTION_INTERVAL === 0) {
    detectFace().catch(() => {});
  }

  const result = handLandmarker.detectForVideo(
    video,
    performance.now()
  );

  buttons.forEach((button) => {
    button.classList.remove("hovered");
  });

  if (result.landmarks.length > 0) {
    const indexFinger = result.landmarks[0][8];

    const x = (1 - indexFinger.x) * window.innerWidth;
    const y = indexFinger.y * window.innerHeight;

    const button = findButton(x, y);
    const now = performance.now();

    let progress = 0;

    if (button) {
      button.classList.add("hovered");

      const id = button.id;

      if (!(id in hoverStart) || hoverStart[id] === null) {
        hoverStart[id] = now;
      }

      const elapsed = now - hoverStart[id]!;
      progress = Math.min(elapsed / HOLD_TIME, 1);

      if (
        elapsed >= HOLD_TIME &&
        now - (lastFired[id] ?? 0) > COOLDOWN_TIME
      ) {
        lastFired[id] = now;
        hoverStart[id] = null;

        fireButton(button);
      }
    } else {
      Object.keys(hoverStart).forEach((key) => {
        hoverStart[key] = null;
      });
    }

    drawPointer(x, y, progress);
  } else {
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    Object.keys(hoverStart).forEach((key) => {
      hoverStart[key] = null;
    });
  }

  requestAnimationFrame(detectHands);
}

const messages: Record<string, string> = {
  "btn-saludar": "👋 ¡Hola! Saludaste con el dedo",
  "btn-celebrar": "🎉 ¡Wooooo! A celebrar",
  "btn-reset": "🔄 Todo reseteado",
};

buttons.forEach((button) => {
  button.addEventListener("click", () => {
    status.textContent =
      messages[button.id] ?? "✅ Acción disparada";

    setTimeout(() => {
      status.textContent =
        "Apuntá con el dedo índice y mantené sobre un botón";
    }, 2500);
  });
});

try {
  await startCamera();
  await loadModels();

  loadingScreen.style.display = "none";

  status.textContent =
    "Apuntá con el dedo índice y mantené sobre un botón";

  detectHands();
} catch (error) {
  if (error instanceof Error && error.message !== "camera-denied") {
    loadingText.textContent =
      "Error al cargar los modelos. Revisá la consola.";

    console.error(error);
  }
}
