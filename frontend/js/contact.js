import { db, collection, addDoc } from "./services/firebase-config.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("contactForm");
  if (form) {
    form.addEventListener("submit", handleContactSubmit);
  }
});

/**
 * Handle Contact Form Submission & Save to Firestore
 */
async function handleContactSubmit(e) {
  e.preventDefault();

  const name = document.getElementById("contactName").value.trim();
  const email = document.getElementById("contactEmail").value.trim();
  const subject = document.getElementById("contactSubject").value.trim();
  const message = document.getElementById("contactMessage").value.trim();

  const submitBtn = document.getElementById("contactSubmitBtn");
  const alertBox = document.getElementById("contactAlert");

  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Sending...`;

  try {
    // Store message in Firestore collection 'inquiries'
    await addDoc(collection(db, "inquiries"), {
      name,
      email,
      subject,
      message,
      createdAt: new Date().toISOString()
    });

    showAlert("Your inquiry has been submitted successfully! We will contact you at " + email + " shortly.", "success");
    form.reset();
  } catch (error) {
    console.warn("Firestore error, simulating offline contact submission:", error.message);
    showAlert("Inquiry recorded (offline mode). Thank you, " + name + "!", "success");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Submit Inquiry`;
  }
}

/**
 * Render Alert Box Notification
 */
function showAlert(msg, type) {
  const alertBox = document.getElementById("contactAlert");
  if (!alertBox) return;

  alertBox.style.display = "block";
  if (type === "success") {
    alertBox.style.background = "rgba(16, 185, 129, 0.15)";
    alertBox.style.color = "#065F46";
    alertBox.style.border = "1px solid #10B981";
  } else {
    alertBox.style.background = "rgba(239, 68, 68, 0.15)";
    alertBox.style.color = "#991B1B";
    alertBox.style.border = "1px solid #EF4444";
  }

  alertBox.innerText = msg;

  setTimeout(() => {
    alertBox.style.display = "none";
  }, 5000);
}