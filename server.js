const express = require("express");
const admin = require("firebase-admin");
const cron = require("node-cron");
const mailgun = require("mailgun-js");
const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config();

const serviceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
};

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://iot-integrated-drip-irrigation-default-rtdb.firebaseio.com"
});

const db = admin.database();

// Mailgun Setup
const mg = mailgun({
  apiKey: "fa78bf185a2d0f9341787ec67dfa2a40-24bda9c7-3e7ea9a0",
  domain: "sandbox7da7fda82f1c4604a648dcb9ef0a65d5.mailgun.org" // e.g. sandboxXXXXXX.mailgun.org
});

// Endpoint to receive schedule from frontend
app.post("/schedule", async (req, res) => {
  const { email, fertilizer, amount, scheduleDate } = req.body;
  console.log("Received schedule POST request", req.body);

  // Send immediate confirmation email
  const data = {
    from: "Drip Irrigation <no-reply@sandbox7da7fda82f1c4604a648dcb9ef0a65d5.mailgun.org>",
    to: email,
    subject: "✅ Fertilizer Schedule Confirmed",
    text: `Hello! Your schedule for ${fertilizer} (${amount}) has been set on ${scheduleDate}.`
  };

  try {
    await mg.messages().send(data);
    console.log("Confirmation email sent to", email);
    res.status(200).json({ message: "Email sent" });
  } catch (error) {
    console.error("❌ Mailgun error:", error);
    res.status(500).json({ error: "Failed to send email" });
  }
});

// Send reminder emails (every 5 hours)
async function sendReminders() {
  console.log("🔍 Checking for upcoming reminders...");

  const now = new Date();
  const schedulesSnapshot = await db.ref("schedules").once("value");

  if (!schedulesSnapshot.exists()) return;

  schedulesSnapshot.forEach(async (snap) => {
    const data = snap.val();
    const scheduleDate = new Date(data.scheduleDate);
    const diffDays = Math.floor((scheduleDate - now) / (1000 * 60 * 60 * 24));

    if (diffDays === 3 || diffDays === 1) {
      const userEmail = data.email;

      const message = {
        from: "Drip Irrigation <no-reply@sandbox7da7fda82f1c4604a648dcb9ef0a65d5.mailgun.org>",
        to: userEmail,
        subject: `Reminder: Fertilizer Schedule in ${diffDays} Day(s)`,
        text: `This is a reminder that your ${data.fertilizer} (${data.amount}) is scheduled for ${data.scheduleDate}.`,
      };

      try {
        await mg.messages().send(message);
        console.log("✅ Reminder email sent to", userEmail);
      } catch (err) {
        console.error("❌ Failed to send reminder email:", err);
      }
    }
  });
}

// Cron job runs every 5 hours
cron.schedule("0 */5 * * *", sendReminders);

// Optional: Run once on start
sendReminders();

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
