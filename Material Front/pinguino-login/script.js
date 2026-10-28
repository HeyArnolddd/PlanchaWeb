const mascotWrap = document.querySelector("#mascotWrap");
const caption = document.querySelector("#mascotCaption");
const email = document.querySelector("#email");
const password = document.querySelector("#password");
const togglePassword = document.querySelector("#togglePassword");
const form = document.querySelector("#loginForm");
const submitBtn = document.querySelector("#submitBtn");
const formMessage = document.querySelector("#formMessage");
const emailError = document.querySelector("#emailError");
const passwordError = document.querySelector("#passwordError");

let currentState = "idle";
let returnTimer;

const captions = {
  idle: "¡Hola! Vamos a entrar",
  cover: "No voy a mirar… 🙈",
  peek: "Solo echaré un vistazo 👀",
  surprised: "¡Un momento! Revisemos tus datos",
  success: "¡Lo lograste! 🎉",
  error: "Ups, revisa tus datos"
};

function setMascotState(state, { returnToIdle = false, delay = 2200 } = {}) {
  window.clearTimeout(returnTimer);
  currentState = state;
  mascotWrap.dataset.state = state;
  caption.textContent = captions[state] || captions.idle;

  if (returnToIdle) {
    returnTimer = window.setTimeout(() => {
      // No tapar los ojos si el usuario sigue enfocado en contraseña oculta.
      if (document.activeElement === password && password.type === "password") {
        setMascotState("cover");
      } else {
        setMascotState("idle");
      }
    }, delay);
  }
}

email.addEventListener("focus", () => setMascotState("idle"));
email.addEventListener("input", () => {
  emailError.textContent = "";
  formMessage.textContent = "";
  formMessage.classList.remove("error-message");
});

password.addEventListener("focus", () => {
  setMascotState(password.type === "password" ? "cover" : "peek");
});
password.addEventListener("input", () => {
  passwordError.textContent = "";
  formMessage.textContent = "";
  formMessage.classList.remove("error-message");
  setMascotState(password.type === "password" ? "cover" : "peek");
});

togglePassword.addEventListener("click", () => {
  const show = password.type === "password";
  password.type = show ? "text" : "password";
  togglePassword.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
  togglePassword.setAttribute("aria-pressed", String(show));
  setMascotState(show ? "peek" : "cover");
  password.focus();
});

password.addEventListener("blur", () => {
  if (currentState === "cover" || currentState === "peek") {
    setMascotState("idle", { returnToIdle: true, delay: 350 });
  }
});

document.querySelector("#forgotBtn").addEventListener("click", () => {
  formMessage.classList.remove("error-message");
  formMessage.textContent = "Conecta este botón con tu flujo de recuperación de contraseña.";
  setMascotState("surprised", { returnToIdle: true });
});

document.querySelector("#signupLink").addEventListener("click", (event) => {
  event.preventDefault();
  formMessage.classList.remove("error-message");
  formMessage.textContent = "Conecta este enlace con tu página de registro.";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  emailError.textContent = "";
  passwordError.textContent = "";
  formMessage.textContent = "";
  formMessage.classList.remove("error-message");

  const emailValue = email.value.trim();
  const passwordValue = password.value;
  let valid = true;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
    emailError.textContent = "Ingresa un correo electrónico válido.";
    valid = false;
  }
  if (passwordValue.length < 6) {
    passwordError.textContent = "La contraseña debe tener al menos 6 caracteres.";
    valid = false;
  }

  if (!valid) {
    setMascotState("surprised", { returnToIdle: true });
    formMessage.textContent = "Hay datos que debes corregir.";
    formMessage.classList.add("error-message");
    return;
  }

  // Demo: aquí debes llamar a tu API real. No se autentica ningún usuario todavía.
  submitBtn.disabled = true;
  submitBtn.querySelector("span").textContent = "Validando…";
  setMascotState("surprised");
  formMessage.textContent = "Validando datos de demostración…";

  try {
    // Sustituye este bloque por fetch('/api/auth/login', {...}).
    await new Promise(resolve => window.setTimeout(resolve, 850));

    // Demo intencional: no simula un inicio de sesión exitoso sin un backend.
    formMessage.textContent = "Formulario validado. Falta conectar el backend de autenticación.";
    formMessage.classList.remove("error-message");
    setMascotState("idle", { returnToIdle: true, delay: 2600 });
  } catch (error) {
    formMessage.textContent = "No fue posible iniciar sesión. Inténtalo de nuevo.";
    formMessage.classList.add("error-message");
    setMascotState("surprised", { returnToIdle: true });
  } finally {
    submitBtn.disabled = false;
    submitBtn.querySelector("span").textContent = "Entrar";
  }
});
